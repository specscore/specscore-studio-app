# specscore-studio-app

Angular app served at [`specscore.studio/app/`](https://specscore.studio/app/) — the in-browser workspace for browsing **SpecScore** specifications hosted in GitHub repositories.

Sibling to [`specscore-studio`](https://github.com/specscore/specscore-studio) (the Astro marketing site that handles everything else on `specscore.studio`).

## What it does

- Sign in with GitHub / Google / Microsoft / Apple (Firebase Auth)
- Open any GitHub repo containing SpecScore specs and browse its `spec/features/`, `spec/plans/`, `spec/architecture/`, `spec/tests/` directories
- Render specification Markdown using GitHub's HTML-rendering API
- Per-user saved projects (Firestore-backed, planned)

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Angular 21 (standalone components, zoneless change detection) |
| Build | Nx 22 + pnpm |
| UI | PrimeNG 21 + Tailwind CSS 4 (Aura theme) |
| Auth | Firebase Auth (`@angular/fire`-free; uses `firebase/auth` directly via DI tokens) |
| Data | Firestore via thin facade in `apps/app/src/app/core/firebase/firebase.providers.ts` |
| GitHub API | Raw `fetch()` with `Accept: application/vnd.github.html+json` for pre-rendered markdown |
| Deploy | Cloudflare Workers (Static Assets) — see `wrangler.jsonc` and `worker/index.js` |

## Local dev

```bash
pnpm install
pnpm exec nx serve app          # http://localhost:4200
pnpm exec nx test app           # unit tests
pnpm exec nx build app          # production build → dist/apps/app/browser/
```

Before sign-in works locally, fill in real Firebase credentials in `apps/app/src/environments/environment.ts` — the committed file has `YOUR_API_KEY` placeholders.

## Deploy

Production deploys happen automatically when you push to `main`. **Cloudflare's GitHub integration** (Workers Builds) runs `pnpm install && pnpm exec nx build app` and deploys to the `specscore-studio-app` Worker, bound to `specscore.studio/app/*`.

The Worker (`worker/index.js`) is a thin path-prefix-stripper:
- Requests under `/app/*` go to this Worker (Cloudflare route specificity)
- The Worker strips `/app/` and serves static assets from `dist/apps/app/browser/`
- 404s fall back to `/index.html` for Angular client-side routing

The GitHub Actions CI (`.github/workflows/ci.yml`) only verifies build + tests pass. It does **not** deploy.

## Repo layout

```
apps/
  app/                 Angular application
  app-e2e/             Playwright e2e (smoke tests)
worker/
  index.js             Cloudflare Worker: /app/ prefix stripper + SPA fallback
wrangler.jsonc         Cloudflare Workers config (routes, asset binding)
firebase.json          Firestore rules + indexes (auth/data backend)
.github/workflows/     CI: build + unit test on every push/PR
```

## SpecScore brand architecture

This repo is part of the **SpecScore.Studio** sub-brand (the public web home), not **SpecStudio** (the developer tooling layer). See [`marketing/branding/brand-architecture.md`](https://github.com/specscore/marketing/blob/main/branding/brand-architecture.md) for the full naming model.
