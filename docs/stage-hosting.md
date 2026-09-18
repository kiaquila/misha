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

## Current connection

Cloudflare Workers Builds has been connected to `kiaquila/misha` since
2026-08-26. The old `kiaquila/web-design` Git connection was confirmed inactive
before this connection was enabled. GitHub reports `kiaquila/misha` as a public
repository.

| Setting | Live value |
| --- | --- |
| Worker name | `misha` |
| Repository | `kiaquila/misha` |
| Production branch | `main` |
| Root directory | `website` |
| Build command | `npm run build` |
| Production deploy command | `npm run stage:deploy` |
| Non-production deploy command | `npm run stage:preview` |
| Non-production branch builds | enabled |
| Included build watch path | default |
| Build token | `misha build token` |

The connection was re-verified on 2026-09-18 at `main`
`f1d75d6e05d7333a345c0a9f770194966aef47d7`: the
[`Workers Builds: misha` check](https://github.com/kiaquila/misha/runs/105310051150)
completed successfully.

### Retired previous connection

The Worker was created while this project lived in the `kiaquila/web-design`
monorepository. These settings are retained as historical evidence of the old
connection, not as a recoverable Git source.

| Setting | Previous value |
| --- | --- |
| Worker name | `misha` |
| Repository | `kiaquila/web-design` |
| Production branch | `main` |
| Root directory | `misha/website` |
| Build command | `npm run build` |
| Production deploy command | `npm run stage:deploy` |
| Non-production deploy command | `npm run stage:preview` |
| Included build watch path | `misha/*` |

The `misha/` path was removed from `kiaquila/web-design` `main` on 2026-09-17
in commit `cfae7bb8236435579992ac265aead7d3b9d63a57`. That repository is now
private, and its current `.repo-guard.json` has no `misha` stage project. The
old connection must not be used as a rollback route.

## Reconnecting this repository

Only the account owner can do this: the Git connection and the build
credentials live in Cloudflare. Use this procedure only if the current
`kiaquila/misha` connection must be rebuilt, the checks are green on `main` and
the account owner has authorized the work.

1. In Cloudflare, record the Worker's **current active version id** and the
   commit it was built from. That is the rollback point.
2. Confirm that the Cloudflare GitHub App installation can access
   `kiaquila/misha`. The repository is public, but the installation must still
   be able to select it as the build source.
3. **Confirm no other Git connection is active** before reconnecting this one.
   Two repositories must never be able to build the same Worker at the same
   time.
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

## Verify after reconnecting

- `https://misha.ks-design.workers.dev` returns the page, and an unknown path
  returns the 404 page.
- The security headers from `website/worker/index.ts` are present, including
  `style-src 'self'` with no `'unsafe-inline'`.
- No canonical link, no `og:url` and no sitemap — `SITE_ORIGIN` is still unset.
- The contact address on the page is still `example@e-mail.com`.
- The console is clean and no request leaves the origin.
- The build log shows the warnings for the placeholder address and the missing
  origin, which is the expected state, not a failure.

## Cutover record — 2026-08-26

- Historical rollback version recorded before the cutover:
  `89500e8b-e12d-446c-a772-e30c7d8e6cff` (dashboard prefix `89500e8b`).
- Build served before the cutover: `kiaquila/web-design` commit
  `8ca389c8178aa5b1b47fcf4c05a510534e36d68b`.
- Preview verification build: `kiaquila/misha` commit
  `fb192a3ee868e9ea083b205ae9819f30149f9969`, version URL prefix
  `08db692f`.
- The preview returned the page with a `200`, an unknown route and
  `/sitemap.xml` with `404`, no canonical link or `og:url`, the placeholder
  contact address, no console errors and no request to an external origin.
- Security headers were present, including `style-src 'self'` with no
  `'unsafe-inline'`.

## Rollback

Cloudflare Worker versions are the rollback mechanism. Each deployment records
the version or versions serving traffic; a dashboard rollback creates a new
deployment that sends traffic to the selected previous version.

1. Before a risky change, record the active version id and the source commit.
2. In **Workers & Pages → misha → Deployments**, choose the last known-good
   version and select **Rollback**. Cloudflare documents the same flow in
   [Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
3. Re-run the verification checklist above against the stable URL.

The version recorded in the 2026-08-26 cutover record is evidence of that
event, not a promise that it remains among Cloudflare's available versions or
the correct target for a future incident. Do not disconnect `kiaquila/misha`
or reconnect `kiaquila/web-design` as part of rollback; the old repository no
longer contains the project on `main`.
