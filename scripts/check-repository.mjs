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
import { readFileSync } from "node:fs";
import path from "node:path";

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
  [/(^|\/)\.claude\//, "local tooling state"],
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

// A home directory from whoever happened to run a command. Written split so
// this file does not trip its own rule.
const PERSONAL_PATH = new RegExp(String.raw`(?:^|[\s"'\`(=])/(?:Users|home)/(?!runner\b)[A-Za-z0-9._-]+/`);

const BINARY_EXTENSIONS = /\.(woff2?|ttf|otf|eot|png|jpe?g|gif|webp|avif|ico|pdf|zip|gz)$/i;

for (const file of tracked) {
  if (BINARY_EXTENSIONS.test(file)) continue;

  let text;
  try {
    text = readFileSync(path.join(root, file), "utf8");
  } catch {
    continue; // deleted from the working tree; the index copy is not our concern
  }
  if (text.includes("\0")) continue;

  for (const address of text.match(EMAIL) || []) {
    if (!ALLOWED_EMAILS.has(address.toLowerCase())) {
      fail(file, `contains the address ${address}, which is not on the allowlist`);
    }
  }

  for (const [pattern, what] of SECRET_PATTERNS) {
    if (pattern.test(text)) fail(file, `looks like it contains ${what}`);
  }

  if (PERSONAL_PATH.test(text)) {
    fail(file, "contains a personal absolute path");
  }
}

// 3. Workflow permissions. Every workflow here runs on events a pull request
//    can trigger, so a missing or over-broad grant is the one CI mistake that
//    would matter.
for (const file of tracked.filter((name) => /^\.github\/workflows\/.+\.ya?ml$/.test(name))) {
  const text = readFileSync(path.join(root, file), "utf8");

  if (!/^permissions:\s*$/m.test(text)) {
    fail(file, "must declare top-level `permissions:`");
  }
  if (/\bwrite-all\b/.test(text)) {
    fail(file, "must not grant `write-all`");
  }
  if (/^\s*pull_request_target:/m.test(text)) {
    fail(file, "must not use `pull_request_target`");
  }
  for (const [, action, ref] of text.matchAll(/uses:\s*([\w.-]+\/[\w.\/-]+)@(\S+)/g)) {
    if (!/^[0-9a-f]{40}$/.test(ref)) {
      fail(file, `pins ${action} to \`${ref}\`; use a full commit SHA`);
    }
  }
}

if (problems.length > 0) {
  console.error(`Repository safety failed with ${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`Repository safety passed for ${tracked.length} tracked files.`);
