import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ChipModule } from 'primeng/chip';
import { AvatarModule } from 'primeng/avatar';
import { MessageModule } from 'primeng/message';
import {
  GoogleAuthProvider,
  GithubAuthProvider,
  OAuthProvider,
  linkWithPopup,
  unlink,
  AuthProvider,
} from 'firebase/auth';
import { AuthService } from '@/app/core/services/auth.service';
import { CachedUserService } from '@/app/core/services/cached-user.service';
import { FIREBASE_AUTH } from '@/app/core/firebase/firebase.providers';

interface ProviderInfo {
  name: string;
  providerId: string;
  icon: string;
  authProvider: AuthProvider | null;
}

const PROVIDERS: ProviderInfo[] = [
  { name: 'GitHub', providerId: 'github.com', icon: 'pi pi-github', authProvider: new GithubAuthProvider() },
  { name: 'Email', providerId: 'password', icon: 'pi pi-envelope', authProvider: null },
  { name: 'Google', providerId: 'google.com', icon: 'pi pi-google', authProvider: new GoogleAuthProvider() },
  { name: 'Microsoft', providerId: 'microsoft.com', icon: 'pi pi-microsoft', authProvider: new OAuthProvider('microsoft.com') },
  { name: 'Apple', providerId: 'apple.com', icon: 'pi pi-apple', authProvider: new OAuthProvider('apple.com') },
];

@Component({
  selector: 'app-user-auth-card',
  standalone: true,
  imports: [CommonModule, ButtonModule, ChipModule, AvatarModule, MessageModule],
  template: `
    <div class="flex flex-col gap-4 p-4">
      <!-- User info row: avatar + name -->
      @if (displayUser(); as user) {
        <div class="flex items-center gap-3">
          @if (user.photoURL) {
            <p-avatar [image]="user.photoURL" shape="circle" size="large" />
          } @else {
            <p-avatar [label]="user.displayName?.charAt(0) ?? '?'" shape="circle" size="large" />
          }
          <div class="flex flex-col">
            <span class="font-semibold text-lg">{{ user.displayName ?? 'User' }}</span>
            <span class="text-muted-color text-sm">{{ user.email }}</span>
          </div>
        </div>
      }

      <!-- Provider list -->
      <ul class="list-none p-0 m-0 flex flex-col gap-2">
        @for (provider of providers; track provider.providerId) {
          <li class="flex items-center justify-between p-2 border-round">
            <div class="flex items-center gap-2">
              <i [class]="provider.icon"></i>
              <span class="font-medium">{{ provider.name }}</span>
            </div>
            @if (isLinked(provider.providerId)) {
              <p-chip
                label="Connected"
                [removable]="canUnlink()"
                [disabled]="!authService.authReady()"
                (onRemove)="unlinkProvider(provider.providerId)"
              />
            } @else {
              <p-button
                label="Connect"
                size="small"
                severity="secondary"
                [outlined]="true"
                [disabled]="!provider.authProvider || linking() || !authService.authReady()"
                (onClick)="linkProvider(provider)"
              />
            }
          </li>
        }
      </ul>

      <!-- Error message if any -->
      @if (error()) {
        <p-message severity="error" [text]="error()!" />
      }
    </div>
  `,
})
export class UserAuthCard {
  readonly authService = inject(AuthService);
  private readonly auth = inject(FIREBASE_AUTH);
  private readonly cachedUserService = inject(CachedUserService);

  readonly providers = PROVIDERS;
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
  readonly linking = signal(false);
  readonly error = signal<string | null>(null);

  private readonly linkedProviderIds = signal(this.cachedProviderIds());
  readonly canUnlink = computed(() => this.linkedProviderIds().size > 1);

  constructor() {
    effect(() => {
      this.authService.user();
      this.cachedUserService.cachedUser();
      this.linkedProviderIds.set(this.buildLinkedSet());
    });
  }

  private buildLinkedSet(): Set<string> {
    const user = this.auth.currentUser;
    if (user) {
      return new Set(user.providerData.map((p: { providerId: string }) => p.providerId));
    }
    return this.cachedProviderIds();
  }

  private cachedProviderIds(): Set<string> {
    const cached = this.cachedUserService.cachedUser();
    if (!cached?.record.providers) return new Set<string>();
    return new Set(cached.record.providers.map((p) => p.provider_id));
  }

  isLinked(providerId: string): boolean {
    return this.linkedProviderIds().has(providerId);
  }

  async unlinkProvider(providerId: string): Promise<void> {
    const currentUser = this.auth.currentUser;
    if (!currentUser) return;

    this.error.set(null);
    this.linking.set(true);

    try {
      await unlink(currentUser, providerId);
      this.linkedProviderIds.set(this.buildLinkedSet());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect provider.';
      this.error.set(message);
    } finally {
      this.linking.set(false);
    }
  }

  async linkProvider(provider: ProviderInfo): Promise<void> {
    if (!provider.authProvider) return;

    const currentUser = this.auth.currentUser;
    if (!currentUser) return;

    this.error.set(null);
    this.linking.set(true);

    try {
      await linkWithPopup(currentUser, provider.authProvider);
      this.linkedProviderIds.set(this.buildLinkedSet());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to link provider.';
      this.error.set(message);
    } finally {
      this.linking.set(false);
    }
  }
}
