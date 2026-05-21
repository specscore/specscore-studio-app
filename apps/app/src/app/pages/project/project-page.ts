import { Component, ViewEncapsulation, inject, signal, effect } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '@/app/core/services/auth.service';
import { GitHubService, GitHubApiError } from '@/app/core/services/github.service';

type PageState = 'loading' | 'loaded' | 'not_authenticated' | 'error';

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

  state = signal<PageState>('loading');
  readmeHtml = signal('');
  errorMessage = signal('');
  refreshing = signal(false);

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
