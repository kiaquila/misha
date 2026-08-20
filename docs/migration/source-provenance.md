# Source provenance

This repository was extracted from the `misha/` directory of the
`kiaquila/web-design` multi-project workspace on 2026-08-20. Nothing was
re-created by hand: the published tree and the project's whole commit history
were carried over by `git filter-repo` and then proved against the source.

## Source identity

| Fact | Value |
| --- | --- |
| Source repository | `kiaquila/web-design` |
| Source commit (published `main`) | `3b99cb3d23328013c28eb73ab8525b13b6992d9e` |
| Source subtree | `misha/` |
| Source subtree tree object | `b36de60ad7190e3558155e90f2030a42c9e5bfcb` |
| Rewritten `main` | `30049d6c345fcf38ef3e9178be8ca7849afd09ec` |
| Tags | none — the source project carried no tag |

## How the history was rewritten

In a disposable clone of `kiaquila/web-design`, taken with
`--single-branch --branch main` so that no unrelated branch could be carried
along:

```bash
git filter-repo --path misha/ --path-rename misha/:
```

The rename lifts `misha/website` to `website` and the three project documents —
`README.md`, `AGENTS.md` and `competitor-review.md` — to the repository root,
which is the only topology change the history rewrite makes.

## Proof taken before any migration edit

All four checks were run on the filtered clone, before the baseline or any
adaptation was committed.

1. **Exact tree.** The root tree of the rewritten `main` is
   `b36de60ad7190e3558155e90f2030a42c9e5bfcb` — the same tree object the source
   repository published under `misha/` at
   `3b99cb3d23328013c28eb73ab8525b13b6992d9e`. All 21 files are therefore
   byte-identical to the source, not merely equivalent.
2. **Commit history.** The one project commit that ever touched `misha/` is
   present, with its original author and date, and the rewritten `main` carries
   exactly that one and nothing else:

   | Rewritten | Source | Subject |
   | --- | --- | --- |
   | `30049d6` | `48024e7` | Add the Misha CV portfolio and its Cloudflare stage (#42) |

   The source repository squash-merges its pull requests, so the three commits
   of `misha/cv-portfolio` (pull request #42) were collapsed into that single
   commit upstream before this migration existed, and there are no merge
   commits to preserve. `git filter-repo` parsed 143 upstream commits and
   pruned the 142 that never touched `misha/`. The unmerged upstream branch
   `misha/cv-portfolio` was not carried over; it is still in the source
   repository.
3. **No stray refs.** Only `main` was pushed. The source project carried no
   tag, so none was rewritten.
4. **Object integrity.** `git fsck --full --strict` reports no problem.

## Deliberately not migrated

- **Other customer projects.** `alex-neon`, `alphacentr`, `chaijana`, `ember`
  and `ks` never entered this history. The filter kept a single path.
- **Monorepository-only infrastructure.** `.repo-guard.json`, the multi-project
  `ci.yml`, the shared `docs/stage-hosting.md`, the Cloudflare
  stage-registration workflow and script, and the KS production-deploy workflow
  describe a workspace that no longer exists here; the `web-design` baseline
  replaces them, and this project's own stage settings now live in
  `docs/stage-hosting.md` at this root.
- **Third-party notices for other projects.** `third-party-notices.md` keeps
  only the baseline's own notice plus the Jost licence this project ships.

## Commit map

`git filter-repo` wrote a full old→new commit map for all 143 rewritten
commits. It is not committed — it describes the migration event, not the
product — and is kept locally at
`~/projects/web-design/.claude/migration/misha-2026-08-20/`:

| File | SHA-256 |
| --- | --- |
| `commit-map.txt` | `5dab8e8d3acb47311c7145ed715848472271d58365eee2bf93eeb5dddba6af2a` |
| `ref-map.txt` | `e885047671ab34af03b4254ba0193b35e6a2ddfbbd2c6d277d472a7924f9b93c` |

The same map can be reproduced at any time by re-running the command above
against `3b99cb3d23328013c28eb73ab8525b13b6992d9e`; the rewrite is
deterministic.

## Topology adaptation

Only path topology and repository-shape wording were adapted. **No
biographical fact, date, employer, achievement, metric or contact detail was
changed.** The contact address is still the placeholder `example@e-mail.com`,
the Telegram handle `chapppp` is still marked unverified, `SITE_ORIGIN` is
still unset, and no canonical URL or custom domain was invented.

- `README.md` and `AGENTS.md`: `npm --prefix misha/website run check|dev` lost
  the directory prefix, and `node scripts/check-repository.mjs` became
  `npm run preflight`, which is the baseline's own repository check.
- `AGENTS.md` gained a short **Shared standards** section pointing at
  `docs/standards/` and `.web-design/project.json`, because the baseline's own
  `AGENTS.md` — which normally carries that pointer — was not installed over
  the project's approved instructions.
- The deployment section of `AGENTS.md` dropped `.repo-guard.json` and the link
  to the monorepository's `../docs/stage-hosting.md`. Both are replaced by
  `website/wrangler.json` plus this repository's own
  [`../stage-hosting.md`](../stage-hosting.md), which carries the Worker's
  build settings. The `static-cloudflare` profile keeps Worker names, domains
  and account identifiers project-owned, so they belong here rather than in the
  baseline.
- `README.md` gained a **Repository baseline** section and one open item
  recording that the Cloudflare stage still builds from the old repository.
- `CLAUDE.md` and the root `package.json` came from the baseline and were named
  for this project.
- `website/` was not touched at all: no source file, asset, test or
  `wrangler.json` value differs from the source commit.

## Baseline pin — provisional

`.web-design/lock.json` pins
`f042879d8b6d11cc80021bb19cc4aacd645cc621` from the
`codex/web-design-template-v2` branch of `kiaquila/web-design`, at version
`0.1.0-dev`.

**This is deliberately a provisional pin.** `kiaquila/web-design` has not yet
published an immutable stable release, because the pull request that turns it
into a template — [`kiaquila/web-design#46`](https://github.com/kiaquila/web-design/pull/46)
— is still a draft and must not be merged until every project has been migrated
and verified. `f042879d` is the exact, reachable commit that pull request
proposes, so it is a real 40-character SHA that `baseline-source-verification`
can download and compare, and the standard `npm run setup` adoption path
accepted it without any workaround.

### Required follow-up

After `kiaquila/web-design#46` is merged and the first immutable stable release
is published, this project must be moved onto that release's full commit SHA in
its own separate pull request:

```bash
npm run sync:web-design -- plan  --source-ref <stable-release-sha> --version <x.y.z>
npm run sync:web-design -- apply --source-ref <stable-release-sha> --version <x.y.z>
```

Until that pull request is merged, this repository is pinned to a prerelease
baseline and `0.1.0-dev` must not be treated as a released version.

## Cloudflare — prepared, not switched

Nothing in Cloudflare was changed during this migration. The Worker `misha`
still builds from `kiaquila/web-design` at root `misha/website`. The target
settings, the verification and the rollback-safe cutover order are in
[`../stage-hosting.md`](../stage-hosting.md). Until the cutover happens, the
source directory in the monorepository must stay in place, and the two
repositories must never both deploy this Worker.
