#!/usr/bin/env node
// Repository safety for this project.
//
// This repository holds one static one-page CV for a real, named private
// person. The things that can actually go wrong here are narrow, so this check
// is narrow too: nothing that belongs outside Git gets committed, no personal
// contact address comes back after the migration removed one, no local path or
// credential leaks, and the workflows keep the permissions they were reviewed
// with. It reads the Git index rather than the working tree, so it sees exactly
// what a push would publish.

import { execFileSync } from "node:child_process";
import YAML from "yaml";

const root = process.cwd();
const problems = [];

function fail(file, message) {
  problems.push(`${file}: ${message}`);
}

const tracked = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024
})
  .split("\0")
  .filter(Boolean);

if (tracked.length === 0) {
  console.error("Repository safety could not read the Git index.");
  process.exit(1);
}

// Read the staged blob rather than the file on disk. `git ls-files` lists what
// is in the index, so reopening the path would let a staged address or secret
// pass review whenever the working-tree copy was edited or deleted afterwards.
function readStaged(file) {
  return execFileSync("git", ["cat-file", "blob", `:${file}`], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024
  });
}

// 1. Directories and files that must never be committed. `.gitignore` states
//    the same intent, but an ignore rule added after the fact does not untrack
//    what is already in the index, so the index is what gets checked.
const FORBIDDEN_PATHS = [
  [/(^|\/)node_modules\//, "dependency tree"],
  [/(^|\/)dist\//, "build output"],
  [/(^|\/)coverage\//, "coverage output"],
  [/(^|\/)\.wrangler\//, "local Wrangler state"],
  [/(^|\/)\.next\//, "build output"],
  [/(^|\/)\.omc\//, "local tooling state"],
  [/(^|\/)\.omx\//, "local tooling state"],
  [/(^|\/)\.claude\//, "local tooling state"],
  [/(^|\/)worktrees\//, "a nested worktree"],
  [/(^|\/)tsconfig\.tsbuildinfo$/, "build metadata"],
  [/(^|\/)\.DS_Store$/, "macOS metadata"],
  [/(^|\/)\.env($|\.)/, "environment file"],
  [/\.(key|pem|p12|pfx|session)$/, "credential or session file"]
];

for (const file of tracked) {
  for (const [pattern, what] of FORBIDDEN_PATHS) {
    if (pattern.test(file)) fail(file, `${what} must not be tracked`);
  }
}

// 2. Content rules, over tracked text files only.
//
//    The address allowlist is the point of this section. The migration removed
//    the owner's real address from every reachable commit
//    (docs/migration/source-provenance.md), and the page deliberately ships a
//    placeholder until he decides what to publish. Any other address appearing
//    in a tracked file means that decision was made by accident.
const ALLOWED_EMAILS = new Set([
  "example@e-mail.com", // the published placeholder
  "codex@openai.com" // review co-author trailer
]);

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

const SECRET_PATTERNS = [
  [/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/, "a private key"],
  [/\bgh[pousr]_[A-Za-z0-9]{16,}/, "a GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/, "a GitHub fine-grained token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "an AWS access key id"],
  [/\bsk-[A-Za-z0-9]{20,}/, "an API secret key"],
  [/\bCLOUDFLARE_API_TOKEN\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/, "a Cloudflare API token"]
];

// A home directory from whoever happened to run a command, in either the POSIX
// or the Windows spelling. Written split so this file does not trip its own
// rule.
const PERSONAL_PATHS = [
  new RegExp(String.raw`(?:^|[\s"'\`(=])/(?:Users|home)/(?!runner\b)[A-Za-z0-9._-]+/`),
  new RegExp(String.raw`[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][A-Za-z0-9._-]+`, "i"),
  new RegExp(String.raw`\\\\[A-Za-z0-9._-]+\\(?:Users|home)\\[A-Za-z0-9._-]+`, "i")
];

for (const file of tracked) {
  // Binary is decided by the bytes, not by the extension, so renaming a text
  // file to `contact.pdf` does not exempt it from the rules below.
  const blob = readStaged(file);
  if (blob.includes(0)) continue;
  const text = blob.toString("utf8");

  for (const address of text.match(EMAIL) || []) {
    if (!ALLOWED_EMAILS.has(address.toLowerCase())) {
      fail(file, `contains the address ${address}, which is not on the allowlist`);
    }
  }

  for (const [pattern, what] of SECRET_PATTERNS) {
    if (pattern.test(text)) fail(file, `looks like it contains ${what}`);
  }

  if (PERSONAL_PATHS.some((pattern) => pattern.test(text))) {
    fail(file, "contains a personal absolute path");
  }
}

// 3. Workflows. These are parsed as YAML rather than read line by line,
//    because the invariants below have to hold for every spelling the format
//    allows — `on: [pull_request]`, `"uses": …`, an inline permissions map —
//    and a regex that only recognises the tidy form claims an invariant it
//    does not have.
//
//    The permission rule is blunt on purpose: **no workflow here may grant a
//    write token, on any trigger.** Nothing this repository does needs one —
//    the site is built and served by Cloudflare's own Git integration, not by
//    Actions — so there is no case to weigh trigger by trigger, and no reason
//    for a proposed workflow to be able to write to the repository before
//    anyone has reviewed it. If a workflow ever genuinely needs write access,
//    loosening this is the reviewable change that grants it.

function permissionGrants(permissions) {
  if (permissions === null || permissions === undefined) return [];
  if (typeof permissions === "string") return [{ scope: "*", value: permissions }];
  if (typeof permissions !== "object") return [];
  return Object.entries(permissions).map(([scope, value]) => ({
    scope,
    value: String(value)
  }));
}

// What a `uses` names depends on where it is written, not on how it is spelled:
// at job level it calls a reusable workflow, and in a step it runs an action.
function usesCalls(node) {
  const calls = [];
  if (typeof node?.uses === "string") calls.push({ uses: node.uses, position: "workflow" });
  for (const step of Array.isArray(node?.steps) ? node.steps : []) {
    if (typeof step?.uses === "string") calls.push({ uses: step.uses, position: "action" });
  }
  return calls;
}

const trackedSet = new Set(tracked);

// A `./` reference runs an action from this repository, so its own bytes are
// reviewed here — but the steps inside it are not, and a composite action is
// free to call a mutable third-party one. Follow it.
function checkUses(file, where, { uses, position }, seen) {
  if (uses.startsWith("./")) {
    const target = uses.replace(/^\.\//, "").replace(/\/$/, "");

    // At job level the target is a reusable workflow file. It lives under
    // `.github/workflows/`, so the loop above already holds it to these same
    // rules; here it only has to exist.
    if (position === "workflow") {
      if (!trackedSet.has(target)) {
        fail(file, `${where} uses \`${uses}\`, which is not tracked`);
      }
      return;
    }

    const directory = target;
    const manifest = [`${directory}/action.yml`, `${directory}/action.yaml`].find((candidate) =>
      trackedSet.has(candidate)
    );
    if (!manifest) {
      fail(file, `${where} uses \`${uses}\`, but no tracked \`action.yml\` is there`);
      return;
    }
    if (seen.has(manifest)) return; // a cycle cannot introduce a new action
    seen.add(manifest);

    let action;
    try {
      action = YAML.parse(readStaged(manifest).toString("utf8"));
    } catch (error) {
      fail(manifest, `is not valid YAML: ${error.message}`);
      return;
    }
    for (const nested of usesCalls(action?.runs)) {
      checkUses(manifest, `the composite action reached from ${file}`, nested, seen);
    }
    return;
  }

  if (uses.startsWith("docker://")) {
    if (!/@sha256:[0-9a-f]{64}$/.test(uses)) {
      fail(file, `${where} uses \`${uses}\`; pin the image by digest`);
    }
    return;
  }

  const ref = uses.includes("@") ? uses.slice(uses.lastIndexOf("@") + 1) : null;
  if (!ref) {
    fail(file, `${where} uses \`${uses}\` with no ref; pin a full commit SHA`);
  } else if (!/^[0-9a-f]{40}$/.test(ref)) {
    fail(file, `${where} pins \`${uses}\` to \`${ref}\`; use a full commit SHA`);
  }
}

function triggerNames(on) {
  if (typeof on === "string") return [on];
  if (Array.isArray(on)) return on.map(String);
  if (on && typeof on === "object") return Object.keys(on);
  return [];
}

for (const file of tracked.filter((name) => /^\.github\/workflows\/.+\.ya?ml$/.test(name))) {
  let workflow;
  try {
    workflow = YAML.parse(readStaged(file).toString("utf8"));
  } catch (error) {
    fail(file, `is not valid YAML: ${error.message}`);
    continue;
  }
  if (!workflow || typeof workflow !== "object") {
    fail(file, "does not parse to a workflow mapping");
    continue;
  }

  // YAML 1.1 readers fold a bare `on` key to the boolean true; this one does
  // not, but accepting both costs nothing and removes the question.
  const triggers = triggerNames(workflow.on ?? workflow[true]);
  if (triggers.length === 0) {
    fail(file, "declares no trigger");
  }
  if (triggers.includes("pull_request_target")) {
    fail(file, "must not use `pull_request_target`");
  }

  if (!("permissions" in workflow)) {
    fail(file, "must declare top-level `permissions:`");
  }

  const jobs = workflow.jobs && typeof workflow.jobs === "object" ? workflow.jobs : {};
  const scopes = [
    ["workflow", workflow.permissions],
    ...Object.entries(jobs).map(([name, job]) => [`job \`${name}\``, job?.permissions])
  ];

  for (const [where, permissions] of scopes) {
    for (const { scope, value } of permissionGrants(permissions)) {
      const grant = value.trim().toLowerCase();
      if (grant === "write-all") {
        fail(file, `grants \`write-all\` at ${where}`);
      } else if (grant === "write") {
        fail(file, `grants \`${scope}: write\` at ${where}`);
      }
    }
  }

  for (const [name, job] of Object.entries(jobs)) {
    for (const call of usesCalls(job)) {
      checkUses(file, `job \`${name}\``, call, new Set());
    }
  }
}

if (problems.length > 0) {
  console.error(`Repository safety failed with ${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`Repository safety passed for ${tracked.length} tracked files.`);
