# npm publish runbook (spec 019 phase 3)

Grounded state as of this phase, so the owner can flip the switch in minutes. **No publish
has been executed by this phase** — everything below is prepared, not run.

## Single owner action

1. Add an **`NPM_TOKEN`** repo secret (an npm automation token) at GitHub → repo → Settings
   → Secrets and variables → Actions.
2. Cut a release: `npm version patch|minor|major` (bumps `package.json` + creates the git
   tag), then `git push --follow-tags`. This triggers `.github/workflows/release.yml`,
   which re-runs the same 4 gates as CI (typecheck/lint/build/test), verifies the pushed
   tag matches `package.json` version, then runs `npm publish --provenance --access
   public` using `NPM_TOKEN`.

The 2026-07-08 dry run reached a valid tarball and failed only at `ENEEDAUTH` (no token
configured) — the pipeline itself is proven up to the auth boundary. The package name
`ease-design` is unclaimed on npm.

## What ships

`package.json` `files` is `["dist", "knowledge", "schemas", "templates"]` — a global
`npm i -g ease-design` installs the `ui` core kernel only. The `figma-agent`, `recall`,
and `a11y` hands are separate workspace packages marked `private: true` and are excluded
from `files`; they are not published and not installed by the kernel package. State this
as the current, owner-confirmable scope — extending it (e.g. publishing a hand
separately) is a future decision, not part of this phase.

## Version-gate (this phase)

`design-os doctor` now resolves the local `ui` binary's version and warns (soft — does
not fail health or the exit code) when it is below `design_os.kernel.MIN_UI_VERSION`
(currently `"0.1.0"`, kept in sync with `package.json` "version" at release time). This
makes a future skew between a published `ui` (npm) and a repo-linked `design-os` visible
to the user instead of silent, without breaking any existing dev setup that runs both
from source.

## PyPI status

`design-os/pyproject.toml` now carries full PyPI-ready metadata (`license`, `readme`,
`authors`, `classifiers`, `[project.urls]`) — the "bare listing / missing license"
warnings a `twine upload` would otherwise raise are resolved. `name`/`version`/`scripts`/
`dependencies` were left untouched.

**Remaining blocker (not resolved by this phase, by design):** `design-os`'s
`[tool.uv.sources]` pins `design-os-figma = { workspace = true }`, and
`[dependency-groups] dev` includes it — a `uv` workspace path dependency, not a
publishable PyPI requirement. `pip install design-os` will not resolve this dependency
standalone. Before `design-os` can be published to PyPI, the owner must decide: bundle
`design-os-figma` into the `design-os` core distribution, or publish the figma plugin as
its own PyPI package and switch `design-os`'s dependency off `workspace = true`. No PyPI
publish workflow exists yet (only the npm one, `.github/workflows/release.yml`).

## `design-os update`

Still rebuilds a local git clone in place (`git pull` + `npm run build` + `npm link` in
the ease-design repo) — it does not know how to update from a registry. A registry-based
update path (`npm i -g ease-design@latest` for the kernel, `uv tool upgrade design-os`
once PyPI-published) is future work, flagged here, not implemented in this phase.

## GOTCHA — token type (cost a real failed run, 2026-07-22)

The first real release run (tag `v0.1.0` → run 29884567691) passed every gate, signed a
provenance statement, then **failed the registry PUT with E403**:

> `Two-factor authentication or granular access token with bypass 2fa enabled is required
> to publish packages.`

The account (`jangtrinhvn`) enforces 2FA for publishes. A **granular** access token that
does NOT have "bypass 2FA" enabled can `npm whoami` (read) but **cannot publish** — the read
success is a false green. Nothing was published (registry stayed 404); no harm, just a wasted
run.

**Fix (owner action on npmjs.com):** generate a **Classic → Automation** token (Automation
tokens bypass 2FA and are the standard CI path), or a Granular token with write/publish scope
AND 2FA-bypass enabled. Then update the repo secret and re-run — no new tag needed:

```bash
printf '%s' '<NEW_TOKEN>' | gh secret set NPM_TOKEN --repo jangtrinh/design-os
gh run rerun 29884567691 --repo jangtrinh/design-os   # re-runs the same tag with the new secret
```

Rotate/delete the burned token afterward. The tag `v0.1.0` already points at the merged
main (`13a9444`); the code, gates, and provenance are all proven — only the token blocks.
