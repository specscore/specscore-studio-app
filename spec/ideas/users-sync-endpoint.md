# Idea: Backend endpoint for user record sync

**Status:** Draft
**Date:** 2026-05-21
**Owner:** alexandertrakhimenok
**Promotes To:** —
**Supersedes:** —
**Related Ideas:** —

## Problem Statement

How might we sync the Firebase Auth user profile into our datastore so the app has a per-user record to attach projects/preferences to, without standing up a full backend before we need one?

## Context

`AuthService.signInWith*()` in `apps/app/src/app/core/services/auth.service.ts` calls `apiService.syncUser({display_name, email, photo_url, providers})` after every successful sign-in. The endpoint URL is `${environment.apiBaseUrl}/users/sync` — currently pointing at `https://api.specscore.io/v1/users/sync`, a host that does not exist (`ERR_NAME_NOT_RESOLVED` in DevTools). The failure is silently swallowed in the subscribe handler, so users aren't blocked, but every sign-in produces a red console error and no user record is being persisted server-side.

### Prior art: synchestra-cloud

The synchestra Go backend implemented this exact endpoint at `internal/api/users.go`:

- **Route:** `POST /v1/users/sync`
- **Auth:** middleware verifies the Firebase ID token from the `Authorization: Bearer …` header and injects `uid` into the request context
- **Body:** `{display_name, email, photo_url, providers[], last_sign_out_at?}`
- **Action:** upsert into Firestore `users/{uid}`:
  - First call: writes the full document with `created_at` and `last_sign_in_at` set to now
  - Subsequent calls: merges `display_name`, `email`, `photo_url`, `providers`, refreshes `last_sign_in_at`
- **Response:** `{"status":"ok"}`

The frontend's `ApiService.syncUser()` already matches this shape. **The wire contract is settled — what's missing is the server.**

### Target ecosystem: sneat

`sneat-core-modules/userus/` is a layered Go module with established conventions:

```
userus/
  api4userus/      HTTP handlers       (http_user_create.go, http_link_auth_account.go, …)
  facade4userus/   service layer
  dal4userus/      Firestore access
  dbo4userus/      DB objects (UserDbo embeds appuser.AccountsOfUser, WithLastLogin, ContactBase, …)
  dto4userus/      wire DTOs
  const4userus/    collection names, paths
```

A new `api4userus/http_user_sync.go` would slot into this pattern cleanly. The harder bit is wiring Firebase ID-token verification (sneat has `auth/token4auth/` but I haven't traced whether it already verifies Firebase tokens or speaks another protocol — assumption to validate below).

## Recommended Direction

**Build a `POST /v1/users/sync` endpoint in sneat-go-backend following the `api4userus` convention.** Wire it to the existing `userus.UserDbo` model so future sneat-core-modules features (teams, access, contacts) inherit the user record without a second migration. Mirror synchestra-cloud's contract verbatim so the frontend doesn't change.

Concretely:

1. `api4userus/http_user_sync.go` — new handler. Reuses `auth/token4auth` middleware to extract `uid`. Decodes `dto4userus.SyncUserRequest` from body.
2. `facade4userus/users.go` — add `SyncUser(ctx, uid, params)` method. Get-or-create the `UserDbo`. Update `ContactBase.Name`, `Email`, `PhotoURL`, `AccountsOfUser` (one entry per provider), `WithLastLogin.LastLoginAt`.
3. `api4userus/routes.go` — register `POST /v1/users/sync`.
4. Deploy sneat-go-backend behind a stable URL. Update `environment.prod.ts` `apiBaseUrl` to point at it. `environment.ts` (dev) can keep `localhost:8080/v1` for local Go runs.

**Why this over alternatives:** the User model is the foundation for everything sneat will add later (teams, access, contacts). Skipping the server-side User record forces an awkward backfill when sneat-core-modules features arrive. Better to take the lift once.

## Alternatives Considered

### A. Client-side direct Firestore write — *near-term unblock*

Frontend writes `users/{uid}` directly via the Firebase Web SDK on `onAuthStateChanged`. Zero new infrastructure.

- ✅ Unblocks today, zero ops, zero deploy
- ✅ Firestore rules already restrict writes to `request.auth.uid == userId`
- ❌ Document shape diverges from sneat's `UserDbo` (no `AccountsOfUser` embedding, no sneat-side validation)
- ❌ When sneat features arrive, every user doc needs a migration to the sneat shape
- ❌ Server can't enforce invariants (e.g., "providers must match the verified token's `firebase.identities`")

**Verdict:** worth doing **right now** as a stopgap so console errors disappear, but commit to migrating off it.

### B. Single Firebase Cloud Function — *middle path*

A lightweight `onCall` or `onUserCreate` Cloud Function in `sneat-gcloud-functions` that does the upsert. No HTTP server to deploy.

- ✅ Lighter ops than a full Go service
- ✅ Auto-scales, no infrastructure
- ❌ Splits the user-management code surface between Cloud Functions and sneat-go-backend
- ❌ Cold starts can add ~1s to sign-in flow
- ❌ Locks the user model into Cloud Function dependencies; harder to refactor later

**Verdict:** plausible bridge if (C) is months away, but less coherent than committing fully to one or the other.

### C. Don't sync, drop the call — *if we really don't need the user record*

Remove `apiService.syncUser()` from `AuthService`. Rely on Firebase Auth tokens alone for identity. Build a user doc only when something concrete needs it (e.g., first project saved).

- ✅ Smallest possible change
- ❌ Defers the design but the problem returns the moment any feature wants "the user's display name" without the Auth context (e.g., showing other team members' names)

**Verdict:** acceptable only if we accept a forced design moment later.

## MVP Scope

**Two-phase landing.** Both are timeboxed:

**Phase 0 (this week, ~2h):** Implement Alternative A — frontend writes `users/{uid}` directly via Firestore on auth state change. Removes the console error. Provides a useful record now. Single commit on `specscore-studio-app`.

**Phase 1 (when sneat-go-backend is deployable, ~1–2 days):** Build the `api4userus/http_user_sync.go` handler per Recommended Direction. Flip `environment.prod.ts` `apiBaseUrl`. Migrate any Phase-0 docs into the sneat shape if necessary. Remove the client-side write.

The two phases share a wire contract — the `SyncUserRequest` shape — so swapping between them is a one-line `environment.ts` flip plus an `AuthService` refactor.

## Not Doing (and Why)

- Building the full sneat-go-backend deployment — that's a separate, larger lift
- Adding a teams/access layer — sneat-core-modules will own that later
- Splitting dev/staging/prod Firebase projects — single sneat-work project for now

## Key Assumptions to Validate

| Tier | Assumption | How to validate |
|------|------------|-----------------|
| Must-be-true | `sneat/auth/token4auth` (or another sneat module) can verify Firebase ID tokens issued by the `sneat-work` project | Read `token4auth/` source; if it speaks a different protocol, this idea needs an auth-middleware sub-task |
| Must-be-true | `sneat-go-backend` has (or will have) a deploy target reachable from the browser at a stable HTTPS URL within Phase-1 timeline | Check ops state with the user; if no deploy path exists, Phase 1 blocks on infra |
| Should-be-true | `userus.UserDbo` can absorb the Firebase Auth fields (display name, email, photo URL, providers) without breaking existing sneat invariants | Trace `ContactBase`, `AccountsOfUser`, `WithLastLogin` in `sneat-core-modules` to confirm the embedding works as-is |
| Should-be-true | The synchestra wire contract (`{display_name, email, photo_url, providers[], last_sign_out_at?}`) is the right shape long-term — i.e., no team/access fields needed on first sync | Check if any planned sneat feature needs additional fields on the first sync call; if yes, evolve the DTO now rather than after Phase 1 ships |
| Might-be-true | Client-side direct Firestore write (Phase 0) doesn't cause data we'll regret later | If Phase 1 lands within ~2 weeks of Phase 0, the cleanup is cheap. If longer, reconsider Phase 0 |

## SpecScore Integration

- **New Features this would create:**
  - `users-sync-api` (in sneat-go-backend or this repo, TBD) — the HTTP contract + handler
  - `client-side-user-record` (in this repo) — the Phase-0 stopgap behavior
- **Existing Features affected:**
  - `spec/features/authentication/` — sign-in flow gains a side effect (user record persistence)
- **Dependencies:**
  - Firebase Auth (sneat-work project) — already configured
  - Firestore rules updated for the `projects` field (done in commit `32158ae`)
  - sneat-core-modules `userus` module conventions (for Phase 1)

## Outstanding Questions

1. **Where does the Phase 1 implementation live?** `sneat-go-backend` is the natural home, but it has no `spec/` directory and isn't SpecScore-managed. Do we (a) bootstrap SpecScore in `sneat-go-backend` and file the Feature there, (b) file the Feature here in `specscore-studio-app` and accept the cross-repo seam, or (c) introduce a `specscore-cloud` repo as a sibling?
2. **Does sneat's auth layer already verify Firebase ID tokens?** If not, that's a prerequisite Feature, not part of this Idea.
3. **What's the production `apiBaseUrl`?** Cloudflare Worker fronting sneat-go-backend? Direct Cloud Run URL? GCP API Gateway? Affects CORS config in the handler.
4. **Should the endpoint live at `/v1/users/sync` or follow sneat-go-backend's existing URL conventions?** `userus/api4userus/routes.go` already defines its own URL space — check whether `/users/sync` collides or aligns.
5. **Anonymous sign-in (`UserDbo.IsAnonymous`) — supported on this flow or not?** The current `AuthService` doesn't offer anonymous sign-in, but `UserDbo` has a field for it. Decide whether to accept anonymous syncs or reject.

---
*This document follows the https://specscore.md/idea-specification*
