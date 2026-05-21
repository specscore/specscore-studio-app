import { Injectable } from '@angular/core';
import { Observable, from, of } from 'rxjs';

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
  private readonly cache = new Map<string, CacheEntry>();
  private readonly dirCache = new Map<string, DirCacheEntry>();

  fetchReadmeHtml(owner: string, repo: string, skipCache = false): Observable<string> {
    const key = `${owner}/${repo}`;
    if (!skipCache) {
      const entry = this.cache.get(key);
      if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
        return of(entry.html);
      }
    }
    return from(this.fetchReadmeHtmlAsync(owner, repo));
  }

  private async fetchReadmeHtmlAsync(owner: string, repo: string): Promise<string> {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`,
      {
        headers: {
          Accept: 'application/vnd.github.html+json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new GitHubApiError('not_found', 'This repository does not have a README.md');
      }
      if (response.status === 403) {
        throw new GitHubApiError('forbidden', 'You don\'t have access to this repository');
      }
      throw new GitHubApiError('unknown', `GitHub API error: ${response.status}`);
    }

    const html = this.rewriteRelativeImageUrls(await response.text(), owner, repo);
    this.cache.set(`${owner}/${repo}`, { html, timestamp: Date.now() });
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
      {
        headers: {
          Accept: 'application/vnd.github.html+json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new GitHubApiError('not_found', 'File not found');
      }
      if (response.status === 403) {
        throw new GitHubApiError('forbidden', 'You don\'t have access to this repository');
      }
      throw new GitHubApiError('unknown', `GitHub API error: ${response.status}`);
    }

    const html = this.rewriteRelativeImageUrls(await response.text(), owner, repo);
    this.cache.set(`file:${owner}/${repo}/${path}`, { html, timestamp: Date.now() });
    return html;
  }

  private async fetchDirectoryContentsAsync(owner: string, repo: string, path: string): Promise<GitHubDirectoryEntry[]> {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`,
      {
        headers: { Accept: 'application/vnd.github.v3+json' },
      }
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
