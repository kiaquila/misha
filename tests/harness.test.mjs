import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

// These tests read this repository's own harness files rather than a fixture:
// the policies below are only policies because *these* bytes say so, and a
// fixture would assert the shape of a copy nobody ships.
const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(path.join(root, file), "utf8");
const parse = (file) => YAML.parse(read(file));

test("the harness stays out of GitHub language statistics", () => {
  const attribute = (file) =>
    execFileSync("git", ["check-attr", "linguist-vendored", "--", file], {
      cwd: root,
      encoding: "utf8"
    }).trim();

  for (const harness of [
    "scripts/check-codex-review.mjs",
    "scripts/check-repository.mjs",
    "tests/check-repository.test.mjs",
    "tests/harness.test.mjs"
  ]) {
    assert.equal(attribute(harness), `${harness}: linguist-vendored: set`);
  }

  // The site is the point of the repository, so none of it is vendored —
  // including its build scripts and its tests.
  for (const site of [
    "website/src/content.js",
    "website/src/render.js",
    "website/scripts/build.mjs",
    "website/tests/site.test.mjs"
  ]) {
    assert.equal(attribute(site), `${site}: linguist-vendored: unspecified`);
  }
});

test("every dependency ecosystem updates weekly behind a cooldown", () => {
  const config = parse(".github/dependabot.yml");
  assert.equal(config.version, 2);
  assert.ok(config.updates.length > 0);

  for (const entry of config.updates) {
    assert.equal(entry.schedule.interval, "weekly", entry["package-ecosystem"]);
    assert.equal(entry.cooldown["default-days"], 7);

    // Minor and patch arrive as one pull request; a major is never grouped in,
    // so it stays a pull request of its own and gets reviewed on its own.
    const groups = Object.values(entry.groups);
    assert.equal(groups.length, 1);
    const [group] = groups;
    assert.equal(group["applies-to"], "version-updates");
    assert.deepEqual(group.patterns, ["*"]);
    assert.deepEqual(group["update-types"], ["minor", "patch"]);
  }
});

test("npm cools a release down by how much it can break", () => {
  for (const entry of parse(".github/dependabot.yml").updates) {
    if (entry["package-ecosystem"] !== "npm") continue;
    assert.equal(entry.cooldown["semver-major-days"], 14);
    assert.equal(entry.cooldown["semver-minor-days"], 7);
    assert.equal(entry.cooldown["semver-patch-days"], 3);
  }
});

test("github-actions carries only the default cooldown", () => {
  const actions = parse(".github/dependabot.yml").updates.filter(
    (entry) => entry["package-ecosystem"] === "github-actions"
  );
  assert.equal(actions.length, 1);

  // An action tag is whatever its author pushed, so Dependabot cannot read a
  // semantic version out of it and a `semver-*-days` key here would be a rule
  // that silently never applies.
  for (const key of Object.keys(actions[0].cooldown)) {
    assert.doesNotMatch(key, /^semver-/);
  }
});

test("every npm entry points at a directory that really has a manifest", () => {
  const npm = parse(".github/dependabot.yml").updates.filter(
    (entry) => entry["package-ecosystem"] === "npm"
  );
  assert.ok(npm.length > 0);

  const directories = npm.map((entry) => entry.directory);
  assert.equal(new Set(directories).size, directories.length, "a directory is listed twice");

  for (const directory of directories) {
    const resolved = path.join(root, directory);
    assert.ok(existsSync(path.join(resolved, "package.json")), `${directory} has no package.json`);
    assert.ok(
      existsSync(path.join(resolved, "package-lock.json")),
      `${directory} has no lockfile`
    );
  }
});

test("the OSV scan annotates the pull request and fails on a vulnerability", () => {
  const workflow = parse(".github/workflows/ci.yml");
  const job = workflow.jobs["osv-scan"];

  // The scan reports through the reporter; nothing here uploads a SARIF file,
  // so the job needs no permissions of its own and must not take any.
  assert.equal("permissions" in job, false);

  const osv = job.steps.filter((step) => step.uses?.includes("osv-scanner-action/"));
  assert.equal(osv.length, 2);

  const [scanner, reporter] = osv;
  assert.match(scanner.uses, /\/osv-scanner-action@[0-9a-f]{40}$/);
  assert.match(reporter.uses, /\/osv-reporter-action@[0-9a-f]{40}$/);

  // One release, two actions out of it: a reporter reading a scanner's output
  // has to agree with it about the format.
  const sha = (step) => step.uses.slice(step.uses.lastIndexOf("@") + 1);
  assert.equal(sha(scanner), sha(reporter));

  // The scan itself must not end the job, or the reporter never runs and a
  // finding is a red cross with no annotation on it.
  assert.equal(scanner["continue-on-error"], true);

  const args = (step) => step.with["scan-args"].split("\n").filter(Boolean);
  assert.deepEqual(args(scanner), [
    "--format=json",
    "--output=osv-results.json",
    "--recursive",
    "."
  ]);
  assert.deepEqual(args(reporter), [
    "--output=osv-results.sarif",
    "--new=osv-results.json",
    "--gh-annotations=true",
    "--fail-on-vuln=true"
  ]);
});
