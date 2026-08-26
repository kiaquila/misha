import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(new URL("../scripts/check-repository.mjs", import.meta.url));

// Each case gets a throwaway repository, because the checker reads the Git
// index rather than a directory listing.
function runOn(files) {
  const root = mkdtempSync(path.join(tmpdir(), "misha-safety-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    for (const [name, contents] of Object.entries(files)) {
      const target = path.join(root, name);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
    execFileSync("git", ["add", "-A", "-f"], { cwd: root });
    const result = spawnSync(process.execPath, [checker], { cwd: root, encoding: "utf8" });
    return { code: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// Built at run time from fragments, so this file does not carry a literal the
// checker is meant to reject and then trip its own rule.
const UNLISTED_ADDRESS = ["real.person", "example.org"].join("@");
const PRIVATE_KEY_HEADER = `-----BEGIN PRIVATE${" "}KEY-----`;
const PERSONAL_PATH = ["", "Users", "someone", "projects"].join("/");

const CLEAN = {
  "README.md": "Write to example@e-mail.com.\n",
  ".github/workflows/ci.yml": [
    "name: CI",
    "on:",
    "  pull_request:",
    "permissions:",
    "  contents: read",
    "jobs:",
    "  build:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1",
    ""
  ].join("\n")
};

test("a clean repository passes", () => {
  const { code, output } = runOn(CLEAN);
  assert.equal(code, 0, output);
  assert.match(output, /Repository safety passed/);
});

test("an unlisted contact address is rejected", () => {
  const { code, output } = runOn({
    ...CLEAN,
    "README.md": `Write to ${UNLISTED_ADDRESS}.\n`
  });
  assert.equal(code, 1, output);
  assert.match(output, /not on the allowlist/);
});

test("the published placeholder and the review trailer stay allowed", () => {
  const { code, output } = runOn({
    ...CLEAN,
    "README.md": "example@e-mail.com\n\nCo-authored-by: Codex <codex@openai.com>\n"
  });
  assert.equal(code, 0, output);
});

test("build output must not be tracked", () => {
  const { code, output } = runOn({ ...CLEAN, "website/dist/index.html": "<!doctype html>" });
  assert.equal(code, 1, output);
  assert.match(output, /build output must not be tracked/);
});

test("a dependency tree must not be tracked", () => {
  const { code, output } = runOn({ ...CLEAN, "website/node_modules/x/index.js": "1;" });
  assert.equal(code, 1, output);
  assert.match(output, /dependency tree must not be tracked/);
});

test("an environment file must not be tracked", () => {
  const { code, output } = runOn({ ...CLEAN, ".env": "TOKEN=1\n" });
  assert.equal(code, 1, output);
  assert.match(output, /environment file must not be tracked/);
});

test("a credential-looking blob is rejected", () => {
  const { code, output } = runOn({
    ...CLEAN,
    "notes.md": `${PRIVATE_KEY_HEADER}\nAAAA\n`
  });
  assert.equal(code, 1, output);
  assert.match(output, /private key/);
});

test("a personal absolute path is rejected", () => {
  const { code, output } = runOn({ ...CLEAN, "notes.md": `Run it in ${PERSONAL_PATH}.\n` });
  assert.equal(code, 1, output);
  assert.match(output, /personal absolute path/);
});

test("the CI runner's own path is not a personal path", () => {
  const { code, output } = runOn({ ...CLEAN, "notes.md": `Logs land in ${["", "home", "runner", "work"].join("/")}.\n` });
  assert.equal(code, 0, output);
});

test("a workflow without top-level permissions is rejected", () => {
  const { code, output } = runOn({
    ...CLEAN,
    ".github/workflows/ci.yml": "name: CI\non:\n  pull_request:\njobs: {}\n"
  });
  assert.equal(code, 1, output);
  assert.match(output, /top-level `permissions:`/);
});

test("a workflow granting write-all is rejected", () => {
  const { code, output } = runOn({
    ...CLEAN,
    ".github/workflows/ci.yml": "name: CI\non:\n  pull_request:\npermissions:\n  write-all\njobs: {}\n"
  });
  assert.equal(code, 1, output);
  assert.match(output, /write-all/);
});

test("pull_request_target is rejected", () => {
  const { code, output } = runOn({
    ...CLEAN,
    ".github/workflows/ci.yml":
      "name: CI\non:\n  pull_request_target:\npermissions:\n  contents: read\njobs: {}\n"
  });
  assert.equal(code, 1, output);
  assert.match(output, /pull_request_target/);
});

test("a floating action tag is rejected", () => {
  const { code, output } = runOn({
    ...CLEAN,
    ".github/workflows/ci.yml": CLEAN[".github/workflows/ci.yml"].replace(
      "3d3c42e5aac5ba805825da76410c181273ba90b1",
      "v7"
    )
  });
  assert.equal(code, 1, output);
  assert.match(output, /use a full commit SHA/);
});
