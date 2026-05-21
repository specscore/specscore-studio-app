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

@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  private readonly auth = inject(FIREBASE_AUTH);
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
