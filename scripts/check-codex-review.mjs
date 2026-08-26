#!/usr/bin/env node
// AI review gate.
//
// The review itself is done by the Codex GitHub app, which answers a
// `@codex review <full head sha>` comment on the pull request. This script only
// reads the answer back and decides whether it covers the commit CI is running
// on, so that a review of an older head cannot stand in for the current one.
//
// It passes when Codex has answered for this exact head and raised nothing at
// P0-P2. It fails when Codex raised something blocking, and it fails when Codex
// has not answered for this head yet — in that case ask for a review and re-run
// this job.

const CODEX = "chatgpt-codex-connector[bot]";
const BLOCKING = /\bP[0-2]\b/;

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const pullNumber = process.env.CODEX_REVIEW_PR_NUMBER;
const headSha = (process.env.CODEX_REVIEW_HEAD_SHA || "").toLowerCase();
const waitMs = Number(process.env.CODEX_REVIEW_WAIT_MS || 60_000);
const pollMs = Number(process.env.CODEX_REVIEW_POLL_MS || 10_000);

for (const [name, value] of Object.entries({ repository, token, pullNumber, headSha })) {
  if (!value) {
    console.error(`Codex review gate is missing ${name}.`);
    process.exit(1);
  }
}
if (!/^[0-9a-f]{40}$/.test(headSha)) {
  console.error(`Codex review gate needs a full 40-character head SHA, got "${headSha}".`);
  process.exit(1);
}

const shortSha = headSha.slice(0, 10);

async function api(pathname) {
  const results = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/${pathname}?per_page=100&page=${page}`,
      {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "x-github-api-version": "2022-11-28"
        }
      }
    );
    if (!response.ok) {
      throw new Error(`GitHub API ${pathname} responded ${response.status}`);
    }
    const batch = await response.json();
    results.push(...batch);
    if (batch.length < 100) break;
  }
  return results;
}

function isCodex(entry) {
  return String(entry?.user?.login || "").toLowerCase() === CODEX;
}

// Codex's own summary comment names the commit it read, so it is accepted on
// its own even when the app left no formal review.
function summaryVerdict(comments) {
  const summaries = comments.filter(
    (comment) =>
      isCodex(comment) &&
      /^Codex Review:/im.test(comment.body || "") &&
      new RegExp(`Reviewed commit:?\\*{0,2}\\s*\`?${shortSha}`, "i").test(comment.body || "")
  );
  if (summaries.length === 0) return null;
  const blocking = summaries.find((comment) => BLOCKING.test(comment.body || ""));
  if (blocking) return { result: "fail", why: "its summary for this head names a P0-P2 finding" };
  const clean = summaries.find((comment) =>
    /Didn't find any major issues/i.test(comment.body || "")
  );
  return clean ? { result: "pass", why: "Codex found no major issues on this head" } : null;
}

function reviewVerdict(reviews, inlineComments) {
  const atHead = reviews.filter(
    (review) => isCodex(review) && String(review.commit_id || "").toLowerCase() === headSha
  );
  if (atHead.length === 0) return null;

  for (const review of atHead) {
    if (review.state === "CHANGES_REQUESTED") {
      return { result: "fail", why: "Codex requested changes on this head" };
    }
    if (BLOCKING.test(review.body || "")) {
      return { result: "fail", why: "Codex's review body on this head names a P0-P2 finding" };
    }
    const inline = inlineComments.filter(
      (comment) => isCodex(comment) && comment.pull_request_review_id === review.id
    );
    const blocking = inline.filter((comment) => BLOCKING.test(comment.body || ""));
    if (blocking.length > 0) {
      return {
        result: "fail",
        why: `Codex left ${blocking.length} P0-P2 finding(s) on this head`
      };
    }
  }
  return { result: "pass", why: "Codex reviewed this head and raised nothing blocking" };
}

async function verdict() {
  const [reviews, inlineComments, comments] = await Promise.all([
    api(`pulls/${pullNumber}/reviews`),
    api(`pulls/${pullNumber}/comments`),
    api(`issues/${pullNumber}/comments`)
  ]);
  return reviewVerdict(reviews, inlineComments) || summaryVerdict(comments);
}

const deadline = Date.now() + waitMs;
let answer = null;
for (;;) {
  answer = await verdict();
  if (answer || Date.now() >= deadline) break;
  console.log(`No Codex answer for ${shortSha} yet; waiting…`);
  await new Promise((resolve) => setTimeout(resolve, pollMs));
}

if (!answer) {
  console.error(
    `Codex has not reviewed ${headSha} yet.\n` +
      `Comment "@codex review ${headSha}" on the pull request, then re-run this job.`
  );
  process.exit(1);
}
if (answer.result === "fail") {
  console.error(`Codex review failed for ${headSha}: ${answer.why}.`);
  process.exit(1);
}
console.log(`Codex review passed for ${headSha}: ${answer.why}.`);
