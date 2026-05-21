# CI/CD Workflows

## ci.yml — Main CI Pipeline

Single job: **build-and-test**. Runs on every push to any branch and every PR targeting `main`.

| Step | Command |
|---|---|
| Install dependencies | `pnpm install --frozen-lockfile` |
| Unit tests | `pnpm exec nx test app` |
| Production build | `pnpm exec nx build app --configuration=production` |

## Deploys are NOT in this workflow

Production deploys are handled by **Cloudflare's GitHub integration** (Workers Builds). When you push to `main`, CF runs its own build (`pnpm install && pnpm exec nx build app`) and deploys to the `specscore-studio-app` Worker.

The CI here exists to catch breakage **before** CF tries to deploy it. If CI is red, the CF deploy is almost certainly also broken — but the two pipelines are independent and run in parallel.

## What's intentionally not here

- **No e2e job.** Re-add when there are meaningful end-to-end flows to assert (auth, spec navigation against real GitHub).
- **No preview deploy.** Cloudflare handles preview deploys for PRs automatically when the Worker is configured to do so.
- **No smoke test against a deployed URL.** Same reason — CF dashboard reports deploy status; if you want a post-deploy smoke check, add a workflow that runs on `deployment_status` events.
