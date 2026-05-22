import { Component, ViewEncapsulation, inject, signal, effect } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '@/app/core/services/auth.service';
import { GitHubService, GitHubApiError } from '@/app/core/services/github.service';
import { UrlSchemeCoordinatesService } from '@/app/core/routing/url-scheme.guard';

type PageState = 'loading' | 'loaded' | 'not_authenticated' | 'error' | 'handle_unresolved';

@Component({
  selector: 'app-project-page',
  standalone: true,
  imports: [ButtonModule],
  encapsulation: ViewEncapsulation.None,
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
      @case ('loaded') {
        <div class="card p-6">
          <div class="flex items-center justify-between mb-4">
            <span class="text-xl font-semibold">README</span>
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
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly githubService = inject(GitHubService);
  private readonly urlScheme = inject(UrlSchemeCoordinatesService);

  state = signal<PageState>('loading');
  readmeHtml = signal('');
  errorMessage = signal('');
  refreshing = signal(false);
  handleLabel = signal('');

  private owner = '';
  private repo = '';
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

    // Prefer the canonical URL-scheme coordinates set by urlSchemeGuard
    // (plan studio-url-scheme). Fall back to the legacy `?id=` query-param
    // shape for URLs still in the wild (e.g. /app/project?id=...).
    const coords = this.urlScheme.coordinates();
    if (coords?.kind === 'path') {
      this.owner = coords.org;
      this.repo = coords.repo;
      this.loadReadme(false);
      return;
    }
    if (coords?.kind === 'handle') {
      // Handle resolution is a future feature; the URL contract only
      // reserves the route shape per REQ:handle-canonical-route. AC
      // requires "no error chrome" for the parsed shape itself, so we
      // render a neutral "coming soon" panel rather than the error state.
      this.handleLabel.set(`~${coords.handle}/${coords.project_slug}`);
      this.state.set('handle_unresolved');
      return;
    }

    const id = this.route.snapshot.queryParamMap.get('id');
    if (!id) {
      this.state.set('error');
      this.errorMessage.set('No project ID provided.');
      return;
    }

    const parsed = this.parseProjectId(id);
    if (!parsed) {
      this.state.set('error');
      this.errorMessage.set('Invalid project ID format.');
      return;
    }

    this.owner = parsed.owner;
    this.repo = parsed.repo;
    this.loadReadme(false);
  }

  refreshReadme() {
    this.refreshing.set(true);
    this.loadReadme(true);
  }

  async signInWithGitHub() {
    await this.authService.signInWithGitHub();
    this.loaded = false;
    this.init();
  }

  private loadReadme(skipCache: boolean) {
    this.githubService.fetchReadmeHtml(this.owner, this.repo, skipCache).subscribe({
      next: (html) => {
        this.readmeHtml.set(html);
        this.state.set('loaded');
        this.refreshing.set(false);
      },
      error: (err) => {
        if (err instanceof GitHubApiError) {
          this.errorMessage.set(err.message);
        } else {
          this.errorMessage.set('Failed to load README.');
        }
        this.state.set('error');
        this.refreshing.set(false);
      },
    });
  }

  private parseProjectId(id: string): { owner: string; repo: string } | null {
    const match = id.match(/^([^@]+)@([^@]+)@([^@]+)$/);
    if (!match) return null;
    return { owner: match[2], repo: match[1] };
  }
}
