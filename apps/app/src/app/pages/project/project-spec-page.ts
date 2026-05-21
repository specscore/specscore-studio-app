import { Component, ViewEncapsulation, inject, signal, effect } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '@/app/core/services/auth.service';
import { GitHubService, GitHubApiError } from '@/app/core/services/github.service';

type PageState = 'loading' | 'loaded' | 'no_readme' | 'not_authenticated' | 'error';

@Component({
  selector: 'app-project-spec-page',
  standalone: true,
  imports: [ButtonModule],
  encapsulation: ViewEncapsulation.None,
  template: `
    @switch (state()) {
      @case ('not_authenticated') {
        <div class="card">
          <div class="flex flex-col items-center gap-4 p-8 text-center">
            <i class="pi pi-github text-4xl text-muted-color"></i>
            <p class="text-xl font-semibold m-0"><a class="text-primary cursor-pointer" tabindex="0" (click)="signInWithGitHub()" (keydown.enter)="signInWithGitHub()">Sign in with GitHub</a> to view project content</p>
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
            <p class="text-xl font-semibold m-0">{{ title }}</p>
            <p class="text-muted-color m-0">No README.md found in this directory.</p>
          </div>
        </div>
      }
      @case ('loaded') {
        <div class="card p-6">
          <div class="flex items-center justify-between mb-4">
            <span class="text-xl font-semibold">{{ displayPath() }}</span>
            <p-button icon="pi pi-refresh" [text]="true" severity="secondary" size="small" (onClick)="refresh()" [loading]="refreshing()" />
          </div>
          <div class="markdown-body" [innerHTML]="readmeHtml()"></div>
        </div>
      }
    }
  `,
  styles: [`
    @import 'github-markdown-css/github-markdown-light.css';

    app-project-spec-page {
      display: block;
    }
    app-project-spec-page .markdown-body {
      background: transparent;
      color: inherit;
    }
  `]
})
export class ProjectSpecPage {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly githubService = inject(GitHubService);

  title: string;
  state = signal<PageState>('loading');
  readmeHtml = signal('');
  errorMessage = signal('');
  refreshing = signal(false);
  displayPath = signal('');

  private owner = '';
  private repo = '';
  private specPath = '';
  private initialized = false;

  constructor() {
    const route = this.route;
    this.title = route.snapshot.data['title'] ?? 'Specification';

    effect(() => {
      if (!this.authService.authReady()) return;
      if (this.initialized) return;
      this.initialized = true;
      this.init();
    });

    this.route.queryParamMap.subscribe(params => {
      const path = params.get('path');
      if (path && this.initialized) {
        this.specPath = path;
        this.displayPath.set(path);
        this.loadReadme(false);
      }
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

    const pathParam = this.route.snapshot.queryParamMap.get('path');
    const specType = this.route.snapshot.data['specDir'] ?? this.title.toLowerCase();
    this.specPath = pathParam ?? `spec/${specType}`;
    this.displayPath.set(this.specPath);
    this.loadReadme(false);
  }

  refresh() {
    this.refreshing.set(true);
    this.loadReadme(true);
  }

  async signInWithGitHub() {
    await this.authService.signInWithGitHub();
    this.initialized = false;
    this.init();
  }

  private loadReadme(skipCache: boolean) {
    this.state.set('loading');
    const readmePath = `${this.specPath}/README.md`;

    this.githubService.fetchFileHtml(this.owner, this.repo, readmePath, skipCache).subscribe({
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

  private parseProjectId(id: string): { owner: string; repo: string } | null {
    const match = id.match(/^([^@]+)@([^@]+)@([^@]+)$/);
    if (!match) return null;
    return { owner: match[2], repo: match[1] };
  }
}
