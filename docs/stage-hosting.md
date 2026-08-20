# Stage hosting

The CV page is served from one temporary Cloudflare Worker named `misha`,
built by Cloudflare Workers Builds from a connected Git repository. The
repository is the source of truth for the Worker name and its runtime
configuration ([`website/wrangler.json`](../website/wrangler.json)); Cloudflare
owns the Git connection and the build credentials, so no Cloudflare token is
stored in GitHub or committed here.

The page is static, so Cloudflare serves it with Workers Static Assets from
`dist/`. [`website/worker/index.ts`](../website/worker/index.ts) exists only to
attach the security headers the asset pipeline does not set on its own. Its
`style-src` is `'self'` with no `'unsafe-inline'`, which is only possible
because the page sets no inline styles.

| Event | Command after `npm run build` | Result |
| --- | --- | --- |
| Push or merge to `main` | `npm run stage:deploy` | Updates the stable stage |
| Push to any other branch | `npm run stage:preview` | Uploads an isolated version and adds its URL to the pull request |

The stable URL is `https://misha.ks-design.workers.dev`. A pull request gets a
versioned URL shaped like `https://<version>-misha.ks-design.workers.dev`. The
version prefix is assigned by Cloudflare and must not be hard-coded.

`workers_dev: true` keeps the stable stage reachable and `preview_urls: true`
keeps the per-pull-request previews. Both are set in `website/wrangler.json`,
together with the pinned `compatibility_date`.

**The stage is public.** It carries a real person's name, employers and career
history, and its contact address is deliberately the placeholder
`example@e-mail.com` until the owner decides what to publish. Keep it that way
for as long as this stage is reachable.

There is no production target, no canonical URL and no custom domain.
`SITE_ORIGIN` is unset, so the build ships no canonical link, no `og:url` and
no sitemap, and warns about it on every run. `ks-design.art` belongs to the KS
project; this page must never be deployed onto it or onto any other domain
without explicit authorization.

## Current connection — not yet moved

The Worker was created while this project lived in the `kiaquila/web-design`
monorepository and **still builds from that repository**. Nothing in Cloudflare
has been changed by this migration.

| Setting | Value in Cloudflare today |
| --- | --- |
| Worker name | `misha` |
| Repository | `kiaquila/web-design` |
| Production branch | `main` |
| Root directory | `misha/website` |
| Build command | `npm run build` |
| Production deploy command | `npm run stage:deploy` |
| Non-production deploy command | `npm run stage:preview` |
| Included build watch path | `misha/*` |

The source path `misha/` is still present in `kiaquila/web-design`, so that
connection keeps working until it is deliberately changed.

## Cutover to this repository

Only the account owner can do this: the Git connection and the build
credentials live in Cloudflare. Do not start before this repository's
migration pull request is merged and its checks are green on `main`.

1. In Cloudflare, record the Worker's **current active version id** and the
   commit it was built from. That is the rollback point.
2. Authorize the Cloudflare GitHub App for `kiaquila/misha`. The repository is
   private, so the installation has to be granted access to it explicitly.
3. **Disconnect the existing Git connection** from `kiaquila/web-design` before
   connecting the new one. Two repositories must never be able to build the
   same Worker at the same time.
4. Connect `kiaquila/misha` to the same Worker — do not create a second Worker,
   and do not rename this one; Cloudflare requires the dashboard name to match
   `name` in `website/wrangler.json`.
5. Enter the settings below.
6. Under **Settings → Build → Branch control**, keep `main` as production and
   enable builds for non-production branches.
7. Open a throwaway pull request, or push a branch, and confirm the preview
   builds and answers at its versioned URL before touching production.
8. Only then let `main` build, and verify the stable URL.

| Setting | Value after cutover |
| --- | --- |
| Worker name | `misha` (unchanged) |
| Repository | `kiaquila/misha` |
| Production branch | `main` |
| Root directory | `website` |
| Build command | `npm run build` |
| Production deploy command | `npm run stage:deploy` |
| Non-production deploy command | `npm run stage:preview` |
| Included build watch path | default — this repository holds one project |

The monorepository watch path `misha/*` matches nothing here and would stop
every build. Clearing it back to the default is what replaces it; narrowing it
to `website/*` is also correct and only skips builds for root-document changes.

## Verify after cutover

- `https://misha.ks-design.workers.dev` returns the page, and an unknown path
  returns the 404 page.
- The security headers from `website/worker/index.ts` are present, including
  `style-src 'self'` with no `'unsafe-inline'`.
- No canonical link, no `og:url` and no sitemap — `SITE_ORIGIN` is still unset.
- The contact address on the page is still `example@e-mail.com`.
- The console is clean and no request leaves the origin.
- The build log shows the warnings for the placeholder address and the missing
  origin, which is the expected state, not a failure.

## Rollback

- **Fastest:** in Cloudflare, roll the Worker back to the version id recorded in
  step 1. That restores the previously served build without any Git change.
- **Full:** disconnect `kiaquila/misha`, reconnect `kiaquila/web-design` with
  root `misha/website` and the `misha/*` watch path, and rebuild from `main`.
  This works for as long as `misha/` remains in that repository, which is why
  the source path must not be deleted until this stage has been verified from
  here.

## After a verified cutover

`kiaquila/web-design` still lists `misha` in `stageProjects` in its
`.repo-guard.json`, which is what mirrors stable builds into that repository's
`misha / stage` GitHub environment. Once this repository owns the Worker, that
entry describes a stage the monorepository no longer builds. Remove it there in
its own pull request, following that repository's documented procedure for
retiring a stage — and keep the project source and history in place.
