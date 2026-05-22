import { Component, ViewEncapsulation, inject, signal, effect } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '@/app/core/services/auth.service';
import { GitHubService, GitHubApiError } from '@/app/core/services/github.service';
import { UrlSchemeCoordinatesService } from '@/app/core/routing/url-scheme.guard';
import { inferRefFromReferrer } from '@/app/core/routing/referer-ref-inference';

type PageState = 'loading' | 'loaded' | 'no_readme' | 'not_authenticated' | 'error' | 'handle_unresolved';

/** Treat a path as a file (not a directory) iff its last segment contains a
 *  dot — heuristic for "has a file extension". Bare paths (no segment) and
 *  extensionless segments are treated as directories. */
function isFilePath(path: string): boolean {
  if (!path) return false;
  const lastSegment = path.split('/').pop() ?? '';
  return lastSegment.includes('.');
}

@Component({
  selector: 'app-project-page',
  standalone: true,
  imports: [ButtonModule],
  encapsulation: ViewEncapsulation.None,
  // data-op exposes the Studio operation mode in a way that's observable from
  // Playwright/CSS without coupling to internal state — see
  // REQ:op-query-param and AC:op-routes-to-operation. Default 'read' when
  // ?op is absent.
  host: {
    '[attr.data-op]': 'op()',
    '[attr.data-page]': 'page()',
  },
  template: `
    @switch (state()) {
      @case ('not_authenticated') {
        <div class="card">
          <div class="flex flex-col items-center gap-4 p-8 text-center">
            <i class="pi pi-github text-4xl text-muted-color"></i>
            <p class="text-xl font-semibold m-0"><button type="button" class="text-primary cursor-pointer underline bg-transparent border-0 p-0" (click)="signInWithGitHub()">Sign in with GitHub</button> to view project content</p>
            <p class="text-muted-color m-0">Connect your GitHub account to browse project README files.</p>
          </div>
        </div>
      }
      @case ('loading') {
        <div class="card">
          <div class="flex items-center justify-center p-8">
            <i class="pi pi-spin pi-spinner text-4xl text-muted-color"></i>
          </div>
        </div>
      }
      @case ('error') {
        <div class="card">
          <div class="flex flex-col items-center gap-4 p-8 text-center">
            <i class="pi pi-exclamation-triangle text-4xl text-orange-500"></i>
            <p class="text-xl font-semibold m-0">{{ errorMessage() }}</p>
          </div>
        </div>
      }
      @case ('no_readme') {
        <div class="card">
          <div class="flex flex-col items-center gap-4 p-8 text-center">
            <i class="pi pi-file text-4xl text-muted-color"></i>
            <p class="text-xl font-semibold m-0">{{ displayPath() || 'README' }}</p>
            <p class="text-muted-color m-0">No README.md found at this location.</p>
          </div>
        </div>
      }
      @case ('loaded') {
        <div class="card p-6">
          <div class="flex items-center justify-between mb-4">
            <span class="text-xl font-semibold">{{ displayPath() || 'README' }}</span>
            <p-button icon="pi pi-refresh" [text]="true" severity="secondary" size="small" (onClick)="refreshReadme()" [loading]="refreshing()" />
          </div>
          <div class="markdown-body" [innerHTML]="readmeHtml()"></div>
        </div>
      }
      @case ('handle_unresolved') {
        <div class="card" data-testid="handle-unresolved">
          <div class="flex flex-col items-center gap-4 p-8 text-center">
            <i class="pi pi-at text-4xl text-muted-color"></i>
            <p class="text-xl font-semibold m-0">{{ handleLabel() }}</p>
            <p class="text-muted-color m-0">
              Handle resolution is coming soon. The handle namespace is
              reserved in the URL contract; mapping handles to forge
              repositories will arrive in a follow-up feature.
            </p>
          </div>
        </div>
      }
    }
  `,
  styles: [`
    @import 'github-markdown-css/github-markdown-light.css';

    app-project-page {
      display: block;
    }
    app-project-page .markdown-body {
      background: transparent;
      color: inherit;
    }
  `]
})
export class ProjectPage {
  private readonly authService = inject(AuthService);
  private readonly githubService = inject(GitHubService);
  private readonly urlScheme = inject(UrlSchemeCoordinatesService);

  state = signal<PageState>('loading');
  readmeHtml = signal('');
  errorMessage = signal('');
  refreshing = signal(false);
  handleLabel = signal('');
  /** Current operation mode (e.g. 'read', 'explore', 'edit'). Exposed on
   *  the host element as data-op for observable mode-switching per AC. */
  op = signal<string>('read');
  /** Current `#page=` view selector (e.g. 'features', 'plans'). Default
   *  empty string when no `#page=` hash is present. Exposed on the host
   *  element as data-page so AC:page-hash-selects-view is observable. */
  page = signal<string>('');
  /** The artifact path being rendered, for display in the card header. */
  displayPath = signal<string>('');

  private owner = '';
  private repo = '';
  private path = '';
  private ref: string | undefined;
  private loaded = false;

  constructor() {
    effect(() => {
      if (!this.authService.authReady()) return;
      if (this.loaded) return;
      this.loaded = true;
      this.init();
    });
  }

  private init() {
    if (!this.authService.isAuthenticated()) {
      this.state.set('not_authenticated');
      return;
    }

    // ProjectPage consumes parsed coordinates produced by urlSchemeGuard
    // (plan studio-url-scheme). The canonical URL contract is the only
    // supported input — no legacy `?id=` fallback exists.
    const coords = this.urlScheme.coordinates();
    if (!coords) {
      this.state.set('error');
      this.errorMessage.set('This page must be opened from a canonical project URL.');
      return;
    }

    // Reflect ?op and #page= on the host element so AC:op-routes-to-operation
    // and AC:page-hash-selects-view are observable from Playwright/CSS
    // regardless of which URL shape the route took.
    this.op.set(coords.op ?? 'read');
    this.page.set(this.readPageHash());

    if (coords.kind === 'path') {
      this.owner = coords.org;
      this.repo = coords.repo;
      this.path = coords.path;
      this.displayPath.set(coords.path);
      this.ref = coords.ref ?? this.inferAndPersistRef();
      this.loadContent(false);
      return;
    }

    // Handle shape: route shape reserved per REQ:handle-canonical-route but
    // resolution to a concrete forge repository is deferred to a future
    // Feature. No error chrome for the parsed shape itself.
    this.handleLabel.set(`~${coords.handle}${coords.path ? '/' + coords.path : ''}`);
    this.state.set('handle_unresolved');
  }

  refreshReadme() {
    this.refreshing.set(true);
    this.loadContent(true);
  }

  async signInWithGitHub() {
    await this.authService.signInWithGitHub();
    this.loaded = false;
    this.init();
  }

  /**
   * Read `#page=` from the URL fragment per REQ:page-view-hash. Returns the
   * view selector ('features' | 'plans' | 'architecture' | 'tests' | …) or
   * empty string when the hash is absent or malformed. Hash is client-only
   * so this is read directly from window.location, not from the router.
   */
  private readPageHash(): string {
    if (typeof window === 'undefined') return '';
    const hash = window.location.hash; // includes the leading '#' or is ''
    if (!hash) return '';
    const trimmed = hash.startsWith('#') ? hash.slice(1) : hash;
    const params = new URLSearchParams(trimmed);
    return params.get('page') ?? '';
  }

  /**
   * Run Referer-based ref inference (REQ:ref-inference-client-side) once on
   * bootstrap when the route had no explicit ?ref. On success, push the
   * inferred ref into the URL via history.replaceState so a refresh or
   * share preserves the resolved revision. Best-effort — returns undefined
   * (and does NOT touch the URL) when the referrer is absent, opaque, or
   * from an unrecognized forge.
   */
  private inferAndPersistRef(): string | undefined {
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;
    const inferred = inferRefFromReferrer(document.referrer);
    if (!inferred) return undefined;
    const url = new URL(window.location.href);
    url.searchParams.set('ref', inferred);
    window.history.replaceState(window.history.state, '', url.toString());
    return inferred;
  }

  /**
   * Load the README/artifact content based on the current path:
   *   - Empty path → fetch the repository's root README (GitHub /readme endpoint).
   *   - Path looks like a file (last segment has a dot) → fetch the file directly.
   *   - Otherwise (path looks like a directory) → fetch `{path}/README.md`.
   *
   * Wraps the existing GitHubService methods; ref pinning flows through to
   * either path (default branch when undefined per REQ:ref-defaults-to-head).
   */
  private loadContent(skipCache: boolean) {
    const observable = this.path === ''
      ? this.githubService.fetchReadmeHtml(this.owner, this.repo, skipCache, this.ref)
      : isFilePath(this.path)
        ? this.githubService.fetchFileHtml(this.owner, this.repo, this.path, skipCache)
        : this.githubService.fetchFileHtml(this.owner, this.repo, `${this.path}/README.md`, skipCache);

    observable.subscribe({
      next: (html) => {
        this.readmeHtml.set(html);
        this.state.set('loaded');
        this.refreshing.set(false);
      },
      error: (err) => {
        this.refreshing.set(false);
        if (err instanceof GitHubApiError && err.code === 'not_found') {
          this.state.set('no_readme');
        } else if (err instanceof GitHubApiError) {
          this.errorMessage.set(err.message);
          this.state.set('error');
        } else {
          this.errorMessage.set('Failed to load README.');
          this.state.set('error');
        }
      },
    });
  }
}
