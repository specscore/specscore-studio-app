# Cached User Record for Instant UI on Page Reload

## Problem

On page refresh, the UI shows nothing (or sign-in prompts) until Firebase Auth SDK initializes and Firestore listeners connect. This creates a flash of unauthenticated content for returning users.

## Goal

Cache the user's Firestore record in `localStorage` so the UI renders immediately on reload with the user's name, avatar, connected providers, and runners list. Action buttons remain disabled until Firebase auth completes.

## Design

### Cache shape

```typescript
interface CachedUser {
  uid: string;
  record: UserRecord;
}
```

`UserRecord` mirrors the Firestore `users/{uid}` document:

```typescript
interface UserRecord {
  display_name?: string;
  email?: string;
  photo_url?: string;
  providers?: string[];
  hosts?: Record<string, { name?: string }>;
  projects?: Record<string, { name?: string; created_at?: string }>;
}
```

The `uid` is kept separate from `record` to maintain a clean separation between identity and record data, and to allow extensibility for other identity sources.

### localStorage key

Single key: `specscore:cachedUser`. Only one cached user at a time.

### CachedUserService

New service at `apps/app/src/app/core/services/cached-user.service.ts`:

- **On construction:** reads `localStorage['specscore:cachedUser']`, parses it, exposes a `cachedUser` signal of type `CachedUser | null`.
- **`update(uid: string, record: UserRecord)`:** writes `{ uid, record }` to localStorage and updates the signal.
- **`clear()`:** removes the localStorage key and sets the signal to `null`.
- **`validateUid(uid: string)`:** if cached uid doesn't match, calls `clear()`.

### Cache lifecycle

| Event | Action |
|---|---|
| App init | Read localStorage, populate `cachedUser` signal |
| Firestore `users/{uid}` snapshot | Call `update(uid, snapshotData)` |
| Sign-out | Call `clear()` |
| Auth resolves with different uid | Call `validateUid(uid)` (discards stale cache) |
| Auth resolves with `null` and no cache | No-op (user was never signed in) |

### Firestore user document subscription

Currently, `HostService.watchUserHosts()` subscribes to `users/{uid}` but only extracts the `hosts` field. We need to subscribe to the full document and feed changes to `CachedUserService`.

Approach: `AuthService` will subscribe to the `users/{uid}` Firestore document when auth resolves. On each snapshot, it calls `cachedUserService.update(uid, data)`. This keeps the cache always in sync with Firestore.

This subscription replaces the per-field subscriptions in `HostService.watchUserHosts()` — components that need hosts will read from `cachedUserService.cachedUser()?.record.hosts` instead. The `HostService.watchUserHosts()` method remains available for cases that need it but the home page components will use the cached user service.

### Component changes

#### AppTopbar

Currently reads `authService.user()` (Firebase Auth User object) for `displayName`, `photoURL`.

Change to: read display info from `cachedUserService.cachedUser()?.record` first. Falls back to `authService.user()` fields once auth resolves (the signal will be updated with fresh data).

Show user avatar/name when either `cachedUser` or `authService.user()` is available. Disable the sign-out button and user menu actions until `authService.authReady()` is true.

#### Home page (auth card conditional)

Currently: `@if (authService.isAuthenticated()) { <app-user-auth-card /> } @else { <app-sign-in-card /> }`

Change to: show `<app-user-auth-card />` when either `authService.isAuthenticated()` OR `cachedUserService.cachedUser()` is non-null.

#### UserAuthCard

Currently reads provider list from `auth.currentUser.providerData` (Firebase Auth).

Change to: read providers from `cachedUserService.cachedUser()?.record.providers` for initial render. Show "Connected" chips for cached providers. Disable Connect/Disconnect buttons until `authService.authReady()` is true. Once auth resolves, `linkedProviderIds` signal refreshes from live Firebase `providerData` as before.

For user info (avatar, name, email): read from cached record first, fall back to `authService.user()`.

#### RunnersSection

Currently subscribes to `hostService.watchUserHosts(user.uid)` which requires an authenticated user.

Change to: read `cachedUserService.cachedUser()?.record.hosts` for initial render. Show cached runners immediately with their names. Status tags are omitted for cached runners (the cache only has the user's hosts map with names, not live cloud status). Once live data arrives, status tags appear. Once auth resolves, the existing Firestore subscription kicks in and replaces cached data with live data including real status. Disable the "+ Add" button until `authService.authReady()`.

### authReady gating

`authService.authReady` already exists (set to `true` after first `onAuthStateChanged` callback). Components use `[disabled]="!authService.authReady()"` on action buttons:

- AppTopbar: sign-out button
- UserAuthCard: Connect/Disconnect buttons
- RunnersSection: "+ Add" button

Display/read-only content renders immediately from cache.

### Edge cases

- **First visit (no cache):** behaves exactly as today — no cached user, shows sign-in prompts.
- **Cache exists but auth resolves to null (e.g., session expired):** `authService` auth callback fires with `null`. We detect cached user exists but auth is null → clear cache, show sign-in state.
- **Cache exists but auth resolves to different uid:** `validateUid()` discards stale cache, waits for fresh Firestore data for the new user.
- **localStorage disabled/full:** `CachedUserService` catches errors silently. Falls back to no-cache behavior.

### What is NOT changing

- `HostService.getCloudHost()` — still used for fetching cloud host details (status, capabilities).
- `ProjectStoreService` — unchanged; projects card can optionally use cached data but is not in scope.
- Auth guards, auth interceptor — unchanged.
- Sign-in flow — unchanged.
