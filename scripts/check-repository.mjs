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

// A home directory from whoever happened to run a command, in either the POSIX
// or the Windows spelling. Written split so this file does not trip its own
// rule.
const PERSONAL_PATHS = [
  new RegExp(String.raw`(?:^|[\s"'\`(=])/(?:Users|home)/(?!runner\b)[A-Za-z0-9._-]+/`),
  new RegExp(String.raw`[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][A-Za-z0-9._-]+`, "i"),
  new RegExp(String.raw`\\\\[A-Za-z0-9._-]+\\(?:Users|home)\\[A-Za-z0-9._-]+`, "i")
];

const BINARY_EXTENSIONS = /\.(woff2?|ttf|otf|eot|png|jpe?g|gif|webp|avif|ico|pdf|zip|gz)$/i;

for (const file of tracked) {
  if (BINARY_EXTENSIONS.test(file)) continue;

  const blob = readStaged(file);
  if (blob.includes(0)) continue; // binary
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

// 3. Workflow permissions. Every workflow here runs on events a pull request
//    can trigger, so an over-broad grant is the one CI mistake that would
//    matter: a job holding a write token beside proposed code can be made to
//    use it. `write-all` is the loud version, but `contents: write` on a single
//    scope hands over the same token, so both are rejected.

// A line-oriented reader for the `permissions:` maps, which is all this needs:
// it yields every scope grant, whether written as a block, an inline map, or a
// bare `read-all` / `write-all` shorthand.
function permissionGrants(text) {
  const lines = text.split(/\r?\n/);
  const grants = [];

  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index].match(/^(\s*)permissions:\s*(.*)$/);
    if (!header) continue;
    const [, indent, inline] = header;

    if (inline.trim()) {
      const braced = inline.trim().replace(/^\{|\}$/g, "");
      if (braced === inline.trim() && !inline.includes(":")) {
        grants.push({ scope: "*", value: inline.trim() });
        continue;
      }
      for (const entry of braced.split(",")) {
        const [scope, value] = entry.split(":").map((part) => part?.trim());
        if (scope && value) grants.push({ scope, value });
      }
      continue;
    }

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (!line.trim() || line.trim().startsWith("#")) continue;
      const depth = line.match(/^(\s*)/)[1].length;
      if (depth <= indent.length) break;
      const entry = line.trim().match(/^([\w-]+):\s*(\S+)/);
      if (entry) grants.push({ scope: entry[1], value: entry[2] });
      else grants.push({ scope: "*", value: line.trim() });
    }
  }
  return grants;
}

for (const file of tracked.filter((name) => /^\.github\/workflows\/.+\.ya?ml$/.test(name))) {
  const text = readStaged(file).toString("utf8");

  if (!/^permissions:/m.test(text)) {
    fail(file, "must declare top-level `permissions:`");
  }
  if (/^\s*pull_request_target:/m.test(text)) {
    fail(file, "must not use `pull_request_target`");
  }

  // Anything a pull request can start runs beside proposed code.
  const untrusted = /^\s*pull_request:/m.test(text) || /^\s*pull_request_target:/m.test(text);
  for (const { scope, value } of permissionGrants(text)) {
    const grant = value.replace(/^["']|["'],?$/g, "").toLowerCase();
    if (grant === "write-all") {
      fail(file, "must not grant `write-all`");
    } else if (grant === "write" && untrusted) {
      fail(file, `grants \`${scope}: write\` on a pull-request-triggered workflow`);
    }
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
