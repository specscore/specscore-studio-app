import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
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
import { CachedUserService } from '@/app/core/services/cached-user.service';
import { UserRecord } from '@/app/core/models/user-record.model';

/**
 * sessionStorage key for the GitHub OAuth access token captured from the
 * sign-in popup. sessionStorage scope (per-tab, cleared on close) is the
 * conservative default for an XSS-vulnerable token surface — localStorage
 * would survive across tabs but persists indefinitely and leaks more on
 * compromise. Trade-off accepted: tab reload survives, browser restart
 * forces re-sign-in to recover the token.
 */
const GITHUB_TOKEN_STORAGE_KEY = 'github.access_token';

@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly cachedUserService = inject(CachedUserService);
  private readonly firestore = inject(FIRESTORE);
  private readonly firestoreOps = inject(FIRESTORE_OPS);
  private unsubscribe: (() => void) | null = null;
  private unsubscribeUserDoc: (() => void) | null = null;

  readonly authReady = signal(false);

  /**
   * The user's GitHub OAuth access token, captured at sign-in time and
   * restored from sessionStorage across reloads. Used by GitHubService
   * to authenticate REST API calls so the app gets the per-user 5000/hr
   * rate limit instead of the shared 60/hr unauthenticated tier (which
   * runs out fast and surfaces as "You don't have access to this
   * repository" 403s).
   *
   * Null when the user is signed out OR signed in with a non-GitHub
   * provider OR signed in via Firebase persistence after a browser
   * restart (sessionStorage gone). In the third case, the user must
   * sign in again to refresh the token; we don't auto-renew silently.
   */
  private readonly _githubAccessToken = signal<string | null>(
    typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(GITHUB_TOKEN_STORAGE_KEY) : null,
  );
  readonly githubAccessToken = this._githubAccessToken.asReadonly();

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
    const result = await signInWithPopup(this.auth, new GithubAuthProvider());
    // Capture the GitHub OAuth access token from the popup credential and
    // persist it for the lifetime of this tab. Firebase Auth doesn't store
    // the third-party provider token after the popup closes — without this
    // capture, every subsequent GitHub API request would be unauthenticated
    // (60/hr per IP, shared with all visitors).
    const credential = GithubAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken ?? null;
    if (token) {
      this._githubAccessToken.set(token);
      sessionStorage.setItem(GITHUB_TOKEN_STORAGE_KEY, token);
    }
    void this.syncCurrentUser();
  }

  async signInWithGoogle(): Promise<void> {
    await signInWithPopup(this.auth, new GoogleAuthProvider());
    void this.syncCurrentUser();
  }

  async signInWithMicrosoft(): Promise<void> {
    await signInWithPopup(this.auth, new OAuthProvider('microsoft.com'));
    void this.syncCurrentUser();
  }

  async signInWithApple(): Promise<void> {
    await signInWithPopup(this.auth, new OAuthProvider('apple.com'));
    void this.syncCurrentUser();
  }

  async signOut(): Promise<void> {
    this._githubAccessToken.set(null);
    sessionStorage.removeItem(GITHUB_TOKEN_STORAGE_KEY);
    await signOut(this.auth);
  }

  async getIdToken(): Promise<string | null> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) return null;
    return currentUser.getIdToken();
  }

  private onAuthUserChanged(user: User | null): void {
    this.unsubscribeUserDoc?.();
    this.unsubscribeUserDoc = null;

    if (!user) {
      if (this.cachedUserService.cachedUser()) {
        this.cachedUserService.clear();
      }
      return;
    }

    this.cachedUserService.validateUid(user.uid);

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
        // Firestore error — cache stays as-is
      }
    );
  }

  /**
   * Phase 0 of users-sync-endpoint (see spec/ideas/users-sync-endpoint.md):
   * write the user record directly to Firestore on first sign-in. The Firestore
   * rule allows `create` for own-uid but denies `update`, so this is naturally
   * idempotent — subsequent sign-ins see the existing doc and short-circuit.
   *
   * Phase 1 will replace this with a server endpoint that can also refresh
   * `last_sign_in_at` and `providers` on subsequent sign-ins.
   */
  private async syncCurrentUser(): Promise<void> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) return;

    const userDocRef = this.firestoreOps.doc(this.firestore, 'users', currentUser.uid);

    try {
      const snap = await this.firestoreOps.getDoc(userDocRef);
      if (snap.exists()) return;

      const now = new Date();
      await this.firestoreOps.setDoc(userDocRef, {
        display_name: currentUser.displayName ?? '',
        email: currentUser.email ?? '',
        photo_url: currentUser.photoURL ?? '',
        providers: currentUser.providerData.map((p) => ({
          provider_id: p.providerId,
          linked_at: now,
        })),
        created_at: now,
        last_sign_in_at: now,
      });
    } catch (err) {
      // Non-blocking: sign-in itself succeeded. Missing user doc is recoverable
      // when the server endpoint (Phase 1) lands.
      console.error('Failed to create user record in Firestore', err);
    }
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribeUserDoc?.();
  }
}
