import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { FORGE_API_BASES, forgeApiBase } from './forge-api-base';
import { ALLOWED_FORGE_HOSTS } from './forge-host.allowlist';
import { GitHubService } from '@/app/core/services/github.service';

describe('forgeApiBase', () => {
  it('maps github.com to the GitHub REST API base', () => {
    expect(forgeApiBase('github.com')).toBe('https://api.github.com');
  });

  it('returns a mapping for every allow-listed forge', () => {
    // Synchronization invariant: the mapping and the allow-list MUST cover
    // the same set of hosts. If they drift, an allow-listed host could pass
    // the route guard and then crash on forgeApiBase() — or worse, a host
    // in the mapping that isn't on the allow-list could leak through if a
    // caller bypassed the allow-list check.
    for (const host of ALLOWED_FORGE_HOSTS) {
      expect(forgeApiBase(host)).toBeDefined();
    }
    for (const host of Object.keys(FORGE_API_BASES)) {
      expect(ALLOWED_FORGE_HOSTS.has(host)).toBe(true);
    }
  });

  it('throws for attacker-style hosts (defensive guarantee)', () => {
    // These hosts would constitute SSRF if templated into a fetch URL. The
    // throw is a structural guarantee that they cannot reach the network.
    expect(() => forgeApiBase('127.0.0.1')).toThrow();
    expect(() => forgeApiBase('169.254.169.254')).toThrow(); // AWS IMDS
    expect(() => forgeApiBase('localhost')).toThrow();
    expect(() => forgeApiBase('evil.example')).toThrow();
  });

  it('throws for the empty string', () => {
    expect(() => forgeApiBase('')).toThrow();
  });
});

describe('GitHubService outbound URL (REQ:no-host-templating-in-fetch audit)', () => {
  let service: GitHubService;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(GitHubService);
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<p>readme</p>', { status: 200 }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('issues outbound fetches to the hardcoded GitHub API base, not to any URL-supplied host', async () => {
    // Even if upstream coordinates carried an attacker host (which the
    // allow-list would have rejected anyway), GitHubService takes only
    // owner/repo and the URL it constructs starts with the hardcoded
    // api.github.com base. This test pins that invariant.
    await firstValueFrom(service.fetchReadmeHtml('specscore', 'specscore'));

    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl.startsWith('https://api.github.com/')).toBe(true);
    // Defensive: confirm the URL embeds neither attacker hosts nor any
    // pattern that suggests host templating.
    expect(calledUrl).not.toContain('127.0.0.1');
    expect(calledUrl).not.toContain('169.254.169.254');
    expect(calledUrl).not.toContain('localhost');
    expect(calledUrl).not.toMatch(/\{git_host\}/);
  });

  it('still hits the hardcoded base when a ref is supplied (Task 5 pathway)', async () => {
    await firstValueFrom(service.fetchReadmeHtml('o', 'r', false, 'feature/x'));
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl.startsWith('https://api.github.com/')).toBe(true);
    expect(calledUrl).toContain('ref=feature%2Fx');
  });
});
