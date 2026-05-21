# NX Workspace Setup — specscore-app

**Date:** 2026-03-25
**Status:** Approved

## Overview

Initialize the `specscore-app` repository as an NX monorepo hosting a single Angular application deployed to Firebase Hosting at `specscore.studio/app`. The workspace is structured to support future growth (additional apps and shared libs) without requiring reorganization.

## Stack

| Item | Value |
|------|-------|
| NX | 22.6.1, `angular-monorepo` preset |
| Angular | 21.2.5, standalone components, SCSS, no SSR |
| PrimeNG | 21.1.3, Aura theme preset |
| TypeScript | ~5.7 |
| Package manager | pnpm |
| Unit tests | Vitest via `@nx/vite`, jsdom environment |
| E2E tests | Playwright via `@nx/playwright` |
| Hosting | Firebase Hosting, site `specscore-app` |
| Canonical URL | `specscore.studio/app` |

## Workspace Structure

```
specscore-app/
├── apps/
│   ├── app/                        # Angular app
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── app.component.ts
│   │   │   │   ├── app.config.ts   # providePrimeNG() configured here
│   │   │   │   └── app.routes.ts
│   │   │   ├── index.html
│   │   │   └── main.ts
│   │   ├── project.json
│   │   └── vite.config.ts          # Vitest config
│   └── app-e2e/                    # Playwright e2e
│       ├── src/
│       ├── project.json
│       └── playwright.config.ts
├── libs/                           # Future shared libs
├── nx.json
├── package.json
├── pnpm-workspace.yaml
├── firebase.json
├── .firebaserc
└── .github/
    └── workflows/
        └── ci.yml
```

## Angular App

- **Preset**: `angular-monorepo`, app name `app`
- **Standalone components**: enabled (Angular 21 default)
- **Styles**: SCSS
- **SSR**: disabled — static output for Firebase Hosting
- **PrimeNG**: installed at workspace root, configured in `app.config.ts` via `providePrimeNG({ theme: { preset: Aura } })`
- **Build output**: `dist/apps/app/browser/` — this is the Firebase Hosting public directory

## Testing

### Unit Tests — Vitest
- Configured via `@nx/vite` in `apps/app/vite.config.ts`
- Environment: jsdom
- Run: `nx test app`

### E2E Tests — Playwright
- App at `apps/app-e2e/` generated via `@nx/playwright`
- Run: `nx e2e app-e2e`

## CI/CD — GitHub Actions

File: `.github/workflows/ci.yml`

### Trigger Matrix

| Event | test | e2e | deploy |
|-------|------|-----|--------|
| Push to `main` | ✓ | ✓ | ✓ (after test) |
| PR into `main` | ✓ | ✓ | — |
| Other push/PR | ✓ | — | — |

### Jobs

**`test`**
1. Checkout
2. Setup pnpm + Node
3. `pnpm install --frozen-lockfile`
4. `nx test app`

**`e2e`** (depends on `test`)
1. Checkout
2. Setup pnpm + Node + Playwright browsers
3. `pnpm install --frozen-lockfile`
4. `nx e2e app-e2e`

**`deploy`** (push to `main` only, depends on `test`)
1. Checkout
2. Setup pnpm + Node
3. `pnpm install --frozen-lockfile`
4. `nx build app --configuration=production`
5. Authenticate via Workload Identity Federation (`google-github-actions/auth`)
6. Deploy via `FirebaseExtended/action-hosting-deploy` to site `specscore-app`

### Authentication — Workload Identity Federation (keyless)

No long-lived credentials stored. GitHub Actions authenticates to GCP via OIDC.

**One-time GCP setup (included in implementation plan):**
1. Create a Workload Identity Pool in GCP
2. Create a Workload Identity Provider linked to `https://token.actions.githubusercontent.com`
3. Bind the provider to a GCP service account with `roles/firebasehosting.admin`
4. Set the attribute condition to restrict to the `specscore-app` repository

**Workflow references (non-sensitive, stored as GitHub Actions variables or inline):**
- `WORKLOAD_IDENTITY_PROVIDER` — full provider resource name
- `SERVICE_ACCOUNT_EMAIL` — service account email

## Firebase Configuration

**`firebase.json`**
```json
{
  "hosting": {
    "site": "specscore-app",
    "public": "dist/apps/app/browser",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}
```

**`.firebaserc`**
```json
{
  "projects": {
    "default": "<firebase-project-id>"
  },
  "targets": {
    "<firebase-project-id>": {
      "hosting": {
        "specscore-app": ["specscore-app"]
      }
    }
  }
}
```

The custom domain `specscore.studio/app` is connected to the `specscore-app` site via the Firebase Hosting console (DNS setup is outside the scope of this plan).
