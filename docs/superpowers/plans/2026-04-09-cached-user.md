# Cached User Record Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cache the Firestore user record in localStorage so the UI renders instantly on page reload with user info, providers, and runners — action buttons stay disabled until Firebase auth completes.

**Architecture:** A new `CachedUserService` owns a single localStorage key (`specscore:cachedUser`) containing `{ uid, record }`. `AuthService` subscribes to the user's Firestore doc and feeds snapshots to the cache. Components read from the cache signal for immediate render, gating actions behind `authReady`.

**Tech Stack:** Angular 19 signals, Firestore `onSnapshot`, localStorage, vitest

**Spec:** `docs/superpowers/specs/2026-04-09-cached-user-design.md`

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `apps/app/src/app/core/models/user-record.model.ts` | `UserRecord` and `CachedUser` interfaces |
| Create | `apps/app/src/app/core/services/cached-user.service.ts` | Cache read/write/clear with signal |
| Create | `apps/app/src/app/core/services/cached-user.service.spec.ts` | Unit tests |
| Modify | `apps/app/src/app/core/services/auth.service.ts` | Subscribe to Firestore user doc, feed cache, clear on sign-out |
| Modify | `apps/app/src/app/layout/component/app.topbar.ts` | Read from cache, disable sign-out until authReady |
| Modify | `apps/app/src/app/pages/home/home.ts` | Show auth card when cache exists |
| Modify | `apps/app/src/app/pages/home/user-auth-card.ts` | Read from cache, disable provider buttons until authReady |
| Modify | `apps/app/src/app/pages/home/runners-section.ts` | Render cached hosts, disable add until authReady |

---

### Task 1: UserRecord model and CachedUser interface

**Files:**
- Create: `apps/app/src/app/core/models/user-record.model.ts`

- [ ] **Step 1: Create the model file**

```typescript
// apps/app/src/app/core/models/user-record.model.ts
import { UserHost } from './host.model';
import { UserProject } from './project.model';

/**
 * Mirrors the Firestore `users/{uid}` document.
 */
export interface UserRecord {
  display_name?: string;
  email?: string;
  photo_url?: string;
  providers?: string[];
  hosts?: Record<string, UserHost>;
  projects?: Record<string, UserProject>;
}

/**
 * Shape stored in localStorage under `specscore:cachedUser`.
 * `uid` is kept separate from `record` to separate identity from data.
 */
export interface CachedUser {
  uid: string;
  record: UserRecord;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/app/src/app/core/models/user-record.model.ts
git commit -m "feat(app): add UserRecord and CachedUser model interfaces"
```

---

### Task 2: CachedUserService with tests (TDD)

**Files:**
- Create: `apps/app/src/app/core/services/cached-user.service.spec.ts`
- Create: `apps/app/src/app/core/services/cached-user.service.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/app/src/app/core/services/cached-user.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { CachedUserService } from './cached-user.service';
import { CachedUser } from '@/app/core/models/user-record.model';

const STORAGE_KEY = 'specscore:cachedUser';

const fakeUser: CachedUser = {
  uid: 'u1',
  record: {
    display_name: 'Alice',
    email: 'alice@test.com',
    photo_url: 'https://img/alice.png',
    providers: ['github.com'],
    hosts: { h1: { name: 'My Runner' } },
  },
};

describe('CachedUserService', () => {
  let service: CachedUserService;

  afterEach(() => localStorage.removeItem(STORAGE_KEY));

  function createService(): CachedUserService {
    TestBed.configureTestingModule({ providers: [CachedUserService] });
    return TestBed.inject(CachedUserService);
  }

  describe('init', () => {
    it('returns null when localStorage is empty', () => {
      service = createService();
      expect(service.cachedUser()).toBeNull();
    });

    it('reads existing cached user from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fakeUser));
      service = createService();
      expect(service.cachedUser()).toEqual(fakeUser);
    });

    it('returns null when localStorage contains invalid JSON', () => {
      localStorage.setItem(STORAGE_KEY, '{broken');
      service = createService();
      expect(service.cachedUser()).toBeNull();
    });
  });

  describe('update', () => {
    it('writes to localStorage and updates the signal', () => {
      service = createService();
      service.update(fakeUser.uid, fakeUser.record);
      expect(service.cachedUser()).toEqual(fakeUser);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(fakeUser);
    });
  });

  describe('clear', () => {
    it('removes from localStorage and nulls the signal', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fakeUser));
      service = createService();
      service.clear();
      expect(service.cachedUser()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('validateUid', () => {
    it('keeps cache when uid matches', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fakeUser));
      service = createService();
      service.validateUid('u1');
      expect(service.cachedUser()).toEqual(fakeUser);
    });

    it('clears cache when uid does not match', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fakeUser));
      service = createService();
      service.validateUid('different-uid');
      expect(service.cachedUser()).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test app --testPathPattern=cached-user`
Expected: FAIL — `cached-user.service` module not found

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/app/src/app/core/services/cached-user.service.ts
import { Injectable, signal } from '@angular/core';
import { CachedUser, UserRecord } from '@/app/core/models/user-record.model';

const STORAGE_KEY = 'specscore:cachedUser';

@Injectable({ providedIn: 'root' })
export class CachedUserService {
  readonly cachedUser = signal<CachedUser | null>(this.load());

  update(uid: string, record: UserRecord): void {
    const entry: CachedUser = { uid, record };
    this.cachedUser.set(entry);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    } catch {
      // localStorage full or disabled — signal still works for this session
    }
  }

  clear(): void {
    this.cachedUser.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  validateUid(uid: string): void {
    const cached = this.cachedUser();
    if (cached && cached.uid !== uid) {
      this.clear();
    }
  }

  private load(): CachedUser | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as CachedUser;
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test app --testPathPattern=cached-user`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/app/core/services/cached-user.service.ts apps/app/src/app/core/services/cached-user.service.spec.ts
git commit -m "feat(app): CachedUserService with localStorage read/write/clear"
```

---

### Task 3: AuthService — subscribe to Firestore user doc and feed cache

**Files:**
- Modify: `apps/app/src/app/core/services/auth.service.ts`

- [ ] **Step 1: Add Firestore user doc subscription and cache integration**

In `auth.service.ts`, inject `CachedUserService`, `FIRESTORE`, and `FIRESTORE_OPS`. In the `user$` tap, when a user arrives: call `cachedUserService.validateUid(user.uid)` and start a Firestore `onSnapshot` subscription to `users/{uid}`. On each snapshot, call `cachedUserService.update(uid, data)`. When user becomes null: if there was a cached user, call `cachedUserService.clear()`. Tear down the Firestore subscription when user changes or on destroy.

Updated `auth.service.ts`:

```typescript
import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subscription } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  GithubAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { FIREBASE_AUTH, FIRESTORE, FIRESTORE_OPS } from '@/app/core/firebase/firebase.providers';
import { ApiService } from '@/app/core/services/api.service';
import { CachedUserService } from '@/app/core/services/cached-user.service';
import { UserRecord } from '@/app/core/models/user-record.model';

@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly apiService = inject(ApiService);
  private readonly cachedUserService = inject(CachedUserService);
  private readonly firestore = inject(FIRESTORE);
  private readonly firestoreOps = inject(FIRESTORE_OPS);
  private unsubscribe: (() => void) | null = null;
  private unsubscribeUserDoc: (() => void) | null = null;

  readonly authReady = signal(false);

  readonly user$ = new Observable<User | null>((subscriber) => {
    this.unsubscribe = onAuthStateChanged(
      this.auth,
      (user) => subscriber.next(user),
      (error) => subscriber.error(error)
    );
  }).pipe(
    tap((user) => {
      this.authReady.set(true);
      this.onAuthUserChanged(user);
    })
  );

  readonly user = toSignal(this.user$, { initialValue: null });
  readonly isAuthenticated = computed(() => this.user() !== null);

  async signInWithGitHub(): Promise<void> {
    await signInWithPopup(this.auth, new GithubAuthProvider());
    this.syncCurrentUser();
  }

  async signInWithGoogle(): Promise<void> {
    await signInWithPopup(this.auth, new GoogleAuthProvider());
    this.syncCurrentUser();
  }

  async signInWithMicrosoft(): Promise<void> {
    await signInWithPopup(this.auth, new OAuthProvider('microsoft.com'));
    this.syncCurrentUser();
  }

  async signInWithApple(): Promise<void> {
    await signInWithPopup(this.auth, new OAuthProvider('apple.com'));
    this.syncCurrentUser();
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
  }

  async getIdToken(): Promise<string | null> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) return null;
    return currentUser.getIdToken();
  }

  private onAuthUserChanged(user: User | null): void {
    // Tear down previous Firestore subscription
    this.unsubscribeUserDoc?.();
    this.unsubscribeUserDoc = null;

    if (!user) {
      // Auth resolved to null — clear cache if one existed
      if (this.cachedUserService.cachedUser()) {
        this.cachedUserService.clear();
      }
      return;
    }

    // Validate cached uid matches
    this.cachedUserService.validateUid(user.uid);

    // Subscribe to Firestore user document
    const userDocRef = this.firestoreOps.doc(this.firestore, 'users', user.uid);
    this.unsubscribeUserDoc = this.firestoreOps.onSnapshot(
      userDocRef,
      (snapshot) => {
        const data = snapshot.data();
        if (data) {
          this.cachedUserService.update(user.uid, data as UserRecord);
        }
      },
      () => {
        // Firestore error — cache stays as-is, will be refreshed on next snapshot
      }
    );
  }

  private syncCurrentUser(): void {
    const currentUser = this.auth.currentUser;
    if (!currentUser) return;

    this.apiService
      .syncUser({
        display_name: currentUser.displayName ?? '',
        email: currentUser.email ?? '',
        photo_url: currentUser.photoURL ?? '',
        providers: currentUser.providerData.map((p) => p.providerId),
      })
      .subscribe({
        error: () => {
          // Fire and forget — don't block sign-in on sync failure
        },
      });
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribeUserDoc?.();
  }
}
```

- [ ] **Step 2: Run existing tests to check for regressions**

Run: `pnpm nx test app`
Expected: All existing tests PASS (auth service has no unit tests currently, but other services that depend on it should still work)

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/app/core/services/auth.service.ts
git commit -m "feat(app): AuthService subscribes to Firestore user doc and feeds CachedUserService"
```

---

### Task 4: AppTopbar — render from cache, disable actions until authReady

**Files:**
- Modify: `apps/app/src/app/layout/component/app.topbar.ts`

- [ ] **Step 1: Inject CachedUserService and add computed signals**

Add a `displayUser` computed that merges cache + auth data, and a `showUserMenu` computed. Disable sign-out button until `authReady`.

Changes to `app.topbar.ts`:

1. Add imports:
```typescript
import { CachedUserService } from '@/app/core/services/cached-user.service';
```

2. Add to the class:
```typescript
private readonly cachedUserService = inject(CachedUserService);

readonly displayUser = computed(() => {
  const authUser = this.authService.user();
  const cached = this.cachedUserService.cachedUser();
  if (authUser) {
    return {
      displayName: authUser.displayName ?? cached?.record.display_name ?? 'User',
      photoURL: authUser.photoURL ?? cached?.record.photo_url ?? null,
    };
  }
  if (cached) {
    return {
      displayName: cached.record.display_name ?? 'User',
      photoURL: cached.record.photo_url ?? null,
    };
  }
  return null;
});

readonly showUser = computed(() => this.displayUser() !== null);
```

3. Replace the template's `@if (authService.isAuthenticated())` block to use `showUser()`:

Replace `@if (authService.isAuthenticated())` with `@if (showUser())`.

Replace avatar/name bindings:
- `authService.user()?.photoURL` → `displayUser()!.photoURL`
- `authService.user()!.photoURL!` → `displayUser()!.photoURL!`
- `(authService.user()?.displayName ?? 'U').charAt(0).toUpperCase()` → `(displayUser()!.displayName).charAt(0).toUpperCase()`
- `authService.user()?.displayName ?? 'User'` → `displayUser()!.displayName`

Add `[disabled]="!authService.authReady()"` to the sign-out button:
```html
<p-button
  label="Sign out"
  icon="pi pi-sign-out"
  [text]="true"
  severity="secondary"
  styleClass="w-full"
  [disabled]="!authService.authReady()"
  (onClick)="signOut(); userMenu.hide()"
/>
```

Also update the `@if (!authService.isAuthenticated())` for the theme buttons (line 75) to `@if (!showUser())` so theme controls show correctly for cached users too.

- [ ] **Step 2: Verify the build compiles**

Run: `pnpm nx build app --configuration=development`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/app/layout/component/app.topbar.ts
git commit -m "feat(app): AppTopbar renders user from cache, disables sign-out until authReady"
```

---

### Task 5: Home page — show auth card when cache exists

**Files:**
- Modify: `apps/app/src/app/pages/home/home.ts`

- [ ] **Step 1: Update the auth card conditional**

1. Add imports:
```typescript
import { CachedUserService } from '@/app/core/services/cached-user.service';
```

2. Add to class:
```typescript
private readonly cachedUserService = inject(CachedUserService);
readonly showAuthCard = computed(() => this.authService.isAuthenticated() || this.cachedUserService.cachedUser() !== null);
```

Add `computed` to the `@angular/core` import.

3. Replace template conditional:
```html
@if (showAuthCard()) {
    <app-user-auth-card />
} @else {
    <app-sign-in-card />
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `pnpm nx build app --configuration=development`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/app/pages/home/home.ts
git commit -m "feat(app): show UserAuthCard when cached user exists"
```

---

### Task 6: UserAuthCard — render from cache, disable actions until authReady

**Files:**
- Modify: `apps/app/src/app/pages/home/user-auth-card.ts`

- [ ] **Step 1: Inject CachedUserService, compute display user and provider states**

1. Add imports:
```typescript
import { CachedUserService } from '@/app/core/services/cached-user.service';
```

2. Add to class:
```typescript
private readonly cachedUserService = inject(CachedUserService);
```

3. Replace `readonly user = this.authService.user;` with a computed that merges cache + auth:

```typescript
readonly displayUser = computed(() => {
  const authUser = this.authService.user();
  const cached = this.cachedUserService.cachedUser();
  if (authUser) {
    return {
      displayName: authUser.displayName ?? cached?.record.display_name ?? null,
      photoURL: authUser.photoURL ?? cached?.record.photo_url ?? null,
      email: authUser.email ?? cached?.record.email ?? null,
    };
  }
  if (cached) {
    return {
      displayName: cached.record.display_name ?? null,
      photoURL: cached.record.photo_url ?? null,
      email: cached.record.email ?? null,
    };
  }
  return null;
});
```

4. Update `linkedProviderIds` to also consider cached providers:

```typescript
private readonly linkedProviderIds = signal(new Set<string>());

private buildLinkedSet(): Set<string> {
  const user = this.auth.currentUser;
  if (user) {
    return new Set(user.providerData.map((p: { providerId: string }) => p.providerId));
  }
  // Fall back to cached providers
  const cached = this.cachedUserService.cachedUser();
  if (cached?.record.providers) {
    return new Set(cached.record.providers);
  }
  return new Set<string>();
}
```

5. Update the template to use `displayUser()`:

Replace `@if (user(); as user)` with `@if (displayUser(); as user)`, and update the inner references:
- `user.photoURL` → `user.photoURL`
- `user.displayName?.charAt(0)` → `user.displayName?.charAt(0)`
- `user.displayName ?? 'User'` → `user.displayName ?? 'User'`
- `user.email` → `user.email`

(The template variable names stay the same since we aliased with `as user`.)

6. Disable action buttons until `authReady`:

For the "Connected" chip, disable remove until auth ready:
```html
<p-chip
  label="Connected"
  [removable]="canUnlink() && authService.authReady()"
  (onRemove)="unlinkProvider(provider.providerId)"
/>
```

For the "Connect" button, add authReady gate:
```html
<p-button
  label="Connect"
  size="small"
  severity="secondary"
  [outlined]="true"
  [disabled]="!provider.authProvider || linking() || !authService.authReady()"
  (onClick)="linkProvider(provider)"
/>
```

7. Make `authService` accessible in template (change from private):
```typescript
readonly authService = inject(AuthService);
```

8. Update the constructor effect to track `displayUser()` instead of `user()`:
```typescript
constructor() {
  effect(() => {
    this.authService.user(); // track auth changes to refresh live providers
    this.refreshLinkedProviders();
  });
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `pnpm nx build app --configuration=development`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/app/pages/home/user-auth-card.ts
git commit -m "feat(app): UserAuthCard renders from cache, disables actions until authReady"
```

---

### Task 7: RunnersSection — render cached hosts, disable actions until authReady

**Files:**
- Modify: `apps/app/src/app/pages/home/runners-section.ts`

- [ ] **Step 1: Inject CachedUserService and render cached hosts**

1. Add imports:
```typescript
import { CachedUserService } from '@/app/core/services/cached-user.service';
```

2. Add to class:
```typescript
private readonly cachedUserService = inject(CachedUserService);
```

3. Add a computed that provides cached hosts as `HostDisplay[]` (without status):

```typescript
private readonly cachedHosts = computed<HostDisplay[]>(() => {
  const cached = this.cachedUserService.cachedUser();
  if (!cached?.record.hosts) return [];
  return Object.entries(cached.record.hosts).map(([id, h]) => ({
    id,
    name: h.name || id,
    status: 'offline' as const,
  }));
});
```

Note: We use `'offline'` as a placeholder status for cached hosts. Once live data arrives from Firestore, it replaces this.

4. Update the template. The key change: show cached hosts when there's a cached user but auth hasn't resolved yet.

Replace the template with:
```html
<div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
            <i class="pi pi-server text-2xl text-primary"></i>
            <span class="text-xl font-semibold">My Runners (VPS)</span>
        </div>
        @if (showUser()) {
            <p-button label="+ Add" [routerLink]="['/add-vps']" severity="secondary" [text]="true" size="small"
                      [disabled]="!authService.authReady()" />
        }
    </div>

    @if (!showUser()) {
        <p class="text-muted-color m-0">Sign in to manage your runners. We need your account to link registered hosts to you.</p>
        <p-button label="Sign In" icon="pi pi-sign-in" routerLink="/auth/login" severity="secondary" styleClass="w-full" />
    } @else if (loading() && displayHosts().length === 0) {
        <p class="text-muted-color m-0">Loading runners...</p>
    } @else if (displayHosts().length === 0) {
        <p class="text-muted-color m-0">No runners registered yet.</p>
        <p-button label="+ Add Runner" icon="pi pi-plus" [routerLink]="['/add-vps']" styleClass="w-full"
                  [disabled]="!authService.authReady()" />
    } @else {
        <div class="flex flex-col gap-2">
            @for (host of displayHosts(); track host.id) {
                <div class="flex items-center justify-between p-2 border-1 surface-border border-round">
                    <span class="font-medium">{{ host.name }}</span>
                    @if (liveDataLoaded()) {
                        <p-tag
                            [value]="host.status"
                            [severity]="host.status === 'online' ? 'success' : 'danger'"
                        />
                    }
                </div>
            }
        </div>
    }
</div>
```

5. Add computed signals:

```typescript
readonly showUser = computed(() => this.authService.isAuthenticated() || this.cachedUserService.cachedUser() !== null);
readonly liveDataLoaded = signal(false);
readonly displayHosts = computed(() => {
  const live = this.hosts();
  if (live.length > 0 || this.liveDataLoaded()) return live;
  return this.cachedHosts();
});
```

6. Update the constructor effect to set `liveDataLoaded` when live data arrives:

```typescript
constructor() {
    effect((onCleanup) => {
        const user = this.authService.user();
        if (!user) {
            this.hosts.set([]);
            this.liveDataLoaded.set(false);
            return;
        }

        this.loading.set(true);
        const sub = this.hostService.watchUserHosts(user.uid).subscribe({
            next: async (userHosts) => {
                const entries = Object.entries(userHosts);
                if (entries.length === 0) {
                    this.hosts.set([]);
                    this.loading.set(false);
                    this.liveDataLoaded.set(true);
                    return;
                }

                const displays: HostDisplay[] = await Promise.all(
                    entries.map(async ([id, userHost]) => {
                        const cloudHost = await this.hostService.getCloudHost(id);
                        return {
                            id,
                            name: userHost.name || cloudHost?.name || id,
                            status: (cloudHost?.status === 'online' ? ('online' as const) : ('offline' as const)),
                        };
                    }),
                );
                this.hosts.set(displays);
                this.loading.set(false);
                this.liveDataLoaded.set(true);
            },
            error: () => {
                this.loading.set(false);
                this.liveDataLoaded.set(true);
            },
        });

        onCleanup(() => sub.unsubscribe());
    });
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `pnpm nx build app --configuration=development`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/app/src/app/pages/home/runners-section.ts
git commit -m "feat(app): RunnersSection renders cached hosts, disables actions until authReady"
```

---

### Task 8: AuthService sign-out clears cache

**Files:**
- Modify: `apps/app/src/app/core/services/auth.service.ts` (already handled in Task 3)

This is already implemented in Task 3's `onAuthUserChanged` method — when `user` is `null` and cache exists, `clear()` is called. No additional work needed.

Verify by reading the code: in `onAuthUserChanged`, when `user` is null, `cachedUserService.clear()` is called if there's a cached user. This covers both explicit sign-out and session expiry.

- [ ] **Step 1: Manual smoke test**

1. Run: `pnpm nx serve app`
2. Sign in with any provider
3. Verify `localStorage.getItem('specscore:cachedUser')` contains user data (check in browser DevTools)
4. Refresh the page — verify header shows user name/avatar immediately, home page shows auth card with providers and runners from cache, action buttons are disabled briefly until auth resolves
5. Sign out — verify `localStorage.getItem('specscore:cachedUser')` is null
6. Refresh — verify sign-in prompts appear (no stale cache)

- [ ] **Step 2: Run all tests**

Run: `pnpm nx test app`
Expected: All tests PASS

- [ ] **Step 3: Final commit (if any fixes needed)**

```bash
git add -u
git commit -m "fix(app): address smoke test findings for cached user"
```

Skip this commit if no changes were needed.
