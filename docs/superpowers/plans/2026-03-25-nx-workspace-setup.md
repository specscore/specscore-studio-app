# NX Workspace Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Initialize the `specscore-app` repo as an NX 22.6.1 angular-monorepo workspace with Angular 21, PrimeNG, Vitest, Playwright, and GitHub Actions CI/CD deploying to Firebase Hosting via Workload Identity Federation.

**Architecture:** NX angular-monorepo preset bootstrapped via `pnpm dlx create-nx-workspace` handles Angular, TypeScript, Vitest, and Playwright scaffolding automatically. PrimeNG is added post-scaffold. Firebase config and GitHub Actions workflow are added manually as the final steps.

**Tech Stack:** NX 22.6.1, Angular 21.2.5, PrimeNG 21.1.3, TypeScript ~5.7, pnpm, Vitest, Playwright, Firebase Hosting, GitHub Actions, Google Workload Identity Federation.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `nx.json` | Generated | NX workspace config |
| `package.json` | Generated | Root pnpm workspace deps |
| `pnpm-workspace.yaml` | Generated | pnpm workspace config |
| `tsconfig.base.json` | Generated | Root TypeScript config |
| `apps/app/` | Generated | Angular 21 app |
| `apps/app/src/app/app.config.ts` | Modified | Add PrimeNG provider |
| `apps/app/src/styles.scss` | Unchanged | No PrimeNG imports needed (Aura is CSS-variable based) |
| `apps/app-e2e/` | Generated | Playwright e2e project |
| `firebase.json` | Created | Firebase Hosting config |
| `.firebaserc` | Created | Firebase project/site binding |
| `.github/workflows/ci.yml` | Created | GitHub Actions CI/CD |

---

## Task 1: Scaffold NX Workspace

**Files:**
- Generate: entire workspace via NX CLI

> Note: The repo already exists with `.git`, `README.md`, and `.gitignore`. Run the command from the **parent directory** (`specscore/`). The `--skipGit` flag prevents NX from reinitializing git.

- [ ] **Step 1: Run create-nx-workspace from parent directory**

```bash
cd /path/to/specscore

pnpm dlx create-nx-workspace@22.6.1 specscore-app \
  --preset=angular-monorepo \
  --appName=app \
  --style=scss \
  --unitTestRunner=vitest \
  --e2eTestRunner=playwright \
  --nxCloud=skip \
  --packageManager=pnpm \
  --skipGit
```

Expected: NX scaffolds into the existing `specscore-app/` directory. You will see output like:
```
✔ Installing dependencies with pnpm
✔ Workspace created
```

- [ ] **Step 2: Verify workspace structure**

```bash
cd specscore-app
ls apps/
```

Expected output: `app  app-e2e`

```bash
ls apps/app/src/app/
```

Expected output: `app.component.html  app.component.scss  app.component.spec.ts  app.component.ts  app.config.ts  app.routes.ts`

- [ ] **Step 3: Verify pnpm lockfile exists**

```bash
ls pnpm-lock.yaml
```

Expected: `pnpm-lock.yaml`

- [ ] **Step 4: Run unit tests to verify baseline**

```bash
nx test app
```

Expected: Vitest runs and passes the generated `app.component.spec.ts`.

- [ ] **Step 5: Run build to verify baseline**

```bash
nx build app
```

Expected: Build succeeds, output in `dist/apps/app/browser/`.

- [ ] **Step 6: Commit scaffold**

```bash
git add .
git commit -m "feat: scaffold NX angular-monorepo workspace"
```

---

## Task 2: Install and Configure PrimeNG

**Files:**
- Modify: `apps/app/src/app/app.config.ts`
- Modify: `apps/app/src/styles.scss`

- [ ] **Step 1: Install PrimeNG**

```bash
pnpm add primeng@21.1.3 @primeng/themes@21.1.3
```

Expected: Packages added to root `package.json` and `pnpm-lock.yaml` updated.

- [ ] **Step 2: Write a failing test for PrimeNG provider**

Add to `apps/app/src/app/app.component.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { appConfig } from './app.config';

describe('AppComponent with PrimeNG', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [...(appConfig.providers ?? [])],
    }).compileComponents();
  });

  it('should bootstrap with PrimeNG configured', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
nx test app
```

Expected: FAIL — `providePrimeNG` not yet imported in `app.config.ts`.

- [ ] **Step 4: Configure PrimeNG in app.config.ts**

Replace the contents of `apps/app/src/app/app.config.ts` with:

```typescript
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: Aura,
      },
    }),
  ],
};
```

- [ ] **Step 5: Verify styles.scss**

PrimeNG 21 with the Aura preset is fully self-contained — theming is driven by `providePrimeNG({ theme: { preset: Aura } })` in `app.config.ts` via CSS variables injected at runtime. No CSS imports are needed in `styles.scss`.

Leave `apps/app/src/styles.scss` as generated (it typically contains only the default Angular comment). Do not add any `@import` for PrimeNG — the `primeng/resources/` directory does not exist in PrimeNG 21 and would cause a build error.

- [ ] **Step 6: Run tests to verify they pass**

```bash
nx test app
```

Expected: All tests pass.

- [ ] **Step 7: Verify build still passes**

```bash
nx build app
```

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add apps/app/src/app/app.config.ts apps/app/src/styles.scss package.json pnpm-lock.yaml
git commit -m "feat: add and configure PrimeNG 21 with Aura theme"
```

---

## Task 3: Add Firebase Configuration

**Files:**
- Create: `firebase.json`
- Create: `.firebaserc`

> **Prerequisite:** You need the Firebase project ID. Find it in the Firebase console at console.firebase.google.com — it looks like `specscore` or similar.

- [ ] **Step 1: Create firebase.json**

```json
{
  "hosting": {
    "site": "specscore-app",
    "public": "dist/apps/app/browser",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

- [ ] **Step 2: Create .firebaserc**

Replace `YOUR_FIREBASE_PROJECT_ID` with your actual Firebase project ID:

```json
{
  "projects": {
    "default": "YOUR_FIREBASE_PROJECT_ID"
  },
  "targets": {
    "YOUR_FIREBASE_PROJECT_ID": {
      "hosting": {
        "specscore-app": [
          "specscore-app"
        ]
      }
    }
  }
}
```

- [ ] **Step 3: Verify the build output directory matches**

```bash
nx build app --configuration=production
ls dist/apps/app/browser/
```

Expected: `index.html` and hashed JS/CSS bundles are present.

- [ ] **Step 4: Commit**

```bash
git add firebase.json .firebaserc
git commit -m "feat: add Firebase Hosting configuration for specscore-app site"
```

---

## Task 4: Add GitHub Actions CI/CD Workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create workflows directory**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: Create .github/workflows/ci.yml**

```yaml
name: CI

on:
  push:
    branches: ['**']
  pull_request:
    branches: [main]

jobs:
  test:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: latest

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run unit tests
        run: pnpm exec nx test app --ci

  e2e:
    name: E2E Tests
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main' || github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: latest

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium

      - name: Build app for e2e
        run: pnpm exec nx build app

      - name: Run e2e tests
        run: pnpm exec nx e2e app-e2e --ci

  deploy:
    name: Deploy to Firebase
    runs-on: ubuntu-latest
    needs: test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    permissions:
      contents: read
      id-token: write   # Required for Workload Identity Federation
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: latest

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build production bundle
        run: pnpm exec nx build app --configuration=production

      - name: Authenticate to Google Cloud (WIF)
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.WORKLOAD_IDENTITY_PROVIDER }}
          service_account: ${{ vars.SERVICE_ACCOUNT_EMAIL }}

      - name: Deploy to Firebase Hosting
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ''   # Empty — WIF auth is already set via google-github-actions/auth
          projectId: ${{ vars.FIREBASE_PROJECT_ID }}
          target: specscore-app
          channelId: live
```

> **Note on WIF auth flow:** `google-github-actions/auth@v2` sets `GOOGLE_APPLICATION_CREDENTIALS` in the environment. `FirebaseExtended/action-hosting-deploy` picks this up automatically when `firebaseServiceAccount` is empty. Leave `firebaseServiceAccount` as an empty string.

- [ ] **Step 3: Add GitHub Actions variables to the repository**

In GitHub repo → Settings → Variables → Actions, add:
- `WORKLOAD_IDENTITY_PROVIDER` — full resource name (see Task 5 for how to get this)
- `SERVICE_ACCOUNT_EMAIL` — service account email
- `FIREBASE_PROJECT_ID` — your Firebase project ID

These are non-sensitive and stored as GitHub Actions Variables (not Secrets).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat: add GitHub Actions CI/CD with WIF Firebase deploy"
```

---

## Task 5: One-Time GCP Workload Identity Federation Setup

> This is a manual setup task performed once in the GCP console or via `gcloud` CLI. It enables GitHub Actions to authenticate to GCP without storing service account keys.

**Prerequisites:** `gcloud` CLI installed and authenticated. Firebase project exists.

- [ ] **Step 1: Set environment variables for the setup commands**

```bash
export PROJECT_ID="YOUR_FIREBASE_PROJECT_ID"
export REPO="specscore/specscore-app"
export POOL_NAME="github-actions-pool"
export PROVIDER_NAME="github-actions-provider"
export SA_NAME="github-deployer"
```

- [ ] **Step 2: Enable required GCP APIs**

```bash
gcloud services enable iamcredentials.googleapis.com \
  --project="${PROJECT_ID}"
```

- [ ] **Step 3: Create a Workload Identity Pool**

```bash
gcloud iam workload-identity-pools create "${POOL_NAME}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --display-name="GitHub Actions Pool"
```

- [ ] **Step 4: Create a Workload Identity Provider**

```bash
gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_NAME}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="${POOL_NAME}" \
  --display-name="GitHub Actions Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.actor=assertion.actor" \
  --attribute-condition="assertion.repository=='${REPO}'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

- [ ] **Step 5: Create a service account for deployments**

```bash
gcloud iam service-accounts create "${SA_NAME}" \
  --project="${PROJECT_ID}" \
  --display-name="GitHub Actions Firebase Deployer"
```

- [ ] **Step 6: Grant Firebase Hosting permissions to the service account**

```bash
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/firebasehosting.admin"
```

- [ ] **Step 7: Allow the Workload Identity Pool to impersonate the service account**

```bash
gcloud iam service-accounts add-iam-policy-binding \
  "${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$(gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${REPO}"
```

- [ ] **Step 8: Get the provider resource name for GitHub Variables**

```bash
gcloud iam workload-identity-pools providers describe "${PROVIDER_NAME}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="${POOL_NAME}" \
  --format="value(name)"
```

Copy the output. It looks like:
`projects/123456789/locations/global/workloadIdentityPools/github-actions-pool/providers/github-actions-provider`

Set this as `WORKLOAD_IDENTITY_PROVIDER` in GitHub Actions Variables.

Set `SERVICE_ACCOUNT_EMAIL` to: `${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com`

- [ ] **Step 9: Verify WIF by triggering a deploy**

Push a commit to `main` and check the GitHub Actions run. The `deploy` job should authenticate and deploy successfully.

---

## Appendix: Custom Domain

The custom domain `specscore.studio/app` is connected in the Firebase Hosting console:

1. Firebase console → Hosting → `specscore-app` site → Add custom domain
2. Enter `specscore.studio/app`
3. Add the provided DNS records (A records or CNAME) to your DNS provider
4. Wait for SSL provisioning (usually a few minutes)

This is a DNS/console step, not a code change.
