import { Injectable, inject } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { AuthService } from './auth.service';

interface CacheEntry {
  html: string;
  timestamp: number;
}

interface DirCacheEntry {
  entries: GitHubDirectoryEntry[];
  timestamp: number;
}

export interface GitHubDirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
}

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

@Injectable({ providedIn: 'root' })
export class GitHubService {
  private readonly authService = inject(AuthService);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly dirCache = new Map<string, DirCacheEntry>();

  /**
   * Build request headers including the user's GitHub OAuth token when
   * available. Without the Authorization header, GitHub caps the app at
   * 60 unauthenticated requests per hour per IP — easily exhausted by a
   * single session of menu browsing, surfacing as 403 "rate limit
   * exceeded" responses to the user. With the token, the per-user limit
   * is 5000/hr.
   */
  private buildHeaders(accept: string): Record<string, string> {
    const headers: Record<string, string> = { Accept: accept };
    const token = this.authService.githubAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  fetchReadmeHtml(owner: string, repo: string, skipCache = false, ref?: string): Observable<string> {
    // ref is part of the cache key so /readme@main and /readme@feature-x
    // don't collide. Undefined ref (default branch) keeps the existing key.
    const key = ref ? `${owner}/${repo}@${ref}` : `${owner}/${repo}`;
    if (!skipCache) {
      const entry = this.cache.get(key);
      if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
        return of(entry.html);
      }
    }
    return from(this.fetchReadmeHtmlAsync(owner, repo, ref));
  }

  private async fetchReadmeHtmlAsync(owner: string, repo: string, ref?: string): Promise<string> {
    // Append `?ref=...` per the GitHub Contents API contract when a ref is
    // pinned (REQ:ref-query-param). Absent ref → server resolves at the
    // repository's default branch (REQ:ref-defaults-to-head).
    const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme${refQuery}`,
      { headers: this.buildHeaders('application/vnd.github.html+json') },
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new GitHubApiError('not_found', 'This repository does not have a README.md');
      }
      if (response.status === 403) {
        throw new GitHubApiError('forbidden', this.forbidden403Message(response));
      }
      throw new GitHubApiError('unknown', `GitHub API error: ${response.status}`);
    }

    const cacheKey = ref ? `${owner}/${repo}@${ref}` : `${owner}/${repo}`;
    const html = this.rewriteRelativeImageUrls(await response.text(), owner, repo);
    this.cache.set(cacheKey, { html, timestamp: Date.now() });
    return html;
  }

  fetchDirectoryContents(owner: string, repo: string, path: string): Observable<GitHubDirectoryEntry[]> {
    const key = `dir:${owner}/${repo}/${path}`;
    const entry = this.dirCache.get(key);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
      return of(entry.entries);
    }
    return from(this.fetchDirectoryContentsAsync(owner, repo, path));
  }

  fetchFileHtml(owner: string, repo: string, path: string, skipCache = false): Observable<string> {
    const key = `file:${owner}/${repo}/${path}`;
    if (!skipCache) {
      const entry = this.cache.get(key);
      if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
        return of(entry.html);
      }
    }
    return from(this.fetchFileHtmlAsync(owner, repo, path));
  }

  private async fetchFileHtmlAsync(owner: string, repo: string, path: string): Promise<string> {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`,
      { headers: this.buildHeaders('application/vnd.github.html+json') },
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new GitHubApiError('not_found', 'File not found');
      }
      if (response.status === 403) {
        throw new GitHubApiError('forbidden', this.forbidden403Message(response));
      }
      throw new GitHubApiError('unknown', `GitHub API error: ${response.status}`);
    }

    const html = this.rewriteRelativeImageUrls(await response.text(), owner, repo);
    this.cache.set(`file:${owner}/${repo}/${path}`, { html, timestamp: Date.now() });
    return html;
  }

  /**
   * Disambiguate the two 403 cases GitHub returns. Without this, a rate-limit
   * 403 (the most common cause for an authenticated app hitting public repos
   * unauthenticated) misleads the user with "You don't have access to this
   * repository" — they DO have access, the app just blew through its 60/hr
   * shared unauthenticated quota. After this fix, signed-in users get the
   * per-user 5000/hr limit; the rate-limit message still surfaces honestly
   * if it does happen.
   */
  private forbidden403Message(response: Response): string {
    const remaining = response.headers.get('x-ratelimit-remaining');
    if (remaining === '0') {
      const resetEpoch = Number(response.headers.get('x-ratelimit-reset') ?? 0);
      if (resetEpoch > 0) {
        const minutes = Math.max(1, Math.ceil((resetEpoch * 1000 - Date.now()) / 60_000));
        return `GitHub API rate limit reached. Try again in ~${minutes} minute(s), or sign in again to refresh your access token.`;
      }
      return 'GitHub API rate limit reached. Try signing in again to refresh your access token.';
    }
    return "You don't have access to this repository.";
  }

  private async fetchDirectoryContentsAsync(owner: string, repo: string, path: string): Promise<GitHubDirectoryEntry[]> {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`,
      { headers: this.buildHeaders('application/vnd.github.v3+json') },
    );

    if (!response.ok) {
      if (response.status === 404) return [];
      throw new GitHubApiError('unknown', `GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) return [];

    const entries: GitHubDirectoryEntry[] = (data as Array<{ type: string; name: string; path: string }>)
      .filter((item) => item.type === 'dir')
      .map((item) => ({ name: item.name, path: item.path, type: 'dir' as const }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const key = `dir:${owner}/${repo}/${path}`;
    this.dirCache.set(key, { entries, timestamp: Date.now() });
    return entries;
  }

  private rewriteRelativeImageUrls(html: string, owner: string, repo: string): string {
    const baseUrl = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/`;
    return html.replace(
      /(<img\s[^>]*?\bsrc=")(?!https?:\/\/)([^"]+)(")/gi,
      (_, before, src, after) => before + new URL(src, baseUrl).href + after,
    );
  }
}

export class GitHubApiError extends Error {
  constructor(
    public readonly code: 'not_found' | 'forbidden' | 'unknown',
    message: string
  ) {
    super(message);
  }
}
