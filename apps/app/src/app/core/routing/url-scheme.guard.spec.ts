import { TestBed } from '@angular/core/testing';
import { UrlSegment, UrlTree, provideRouter } from '@angular/router';
import type { ActivatedRouteSnapshot } from '@angular/router';
import {
  UrlSchemeCoordinatesService,
  canonicalPathMatcher,
  urlSchemeGuard,
} from './url-scheme.guard';

/** Helper: build a UrlSegment from a raw path string. */
function seg(path: string): UrlSegment {
  return new UrlSegment(path, {});
}

/**
 * Helper: invoke the functional guard inside an Angular injection context.
 * The guard returns true | UrlTree depending on validation outcome.
 */
function runGuard(snapshot: Partial<ActivatedRouteSnapshot>): boolean | UrlTree {
  return TestBed.runInInjectionContext(() =>
    urlSchemeGuard(snapshot as ActivatedRouteSnapshot, { url: '' } as never),
  ) as boolean | UrlTree;
}

describe('canonicalPathMatcher', () => {
  it('matches a 3-segment URL and consumes all segments', () => {
    const segments = [seg('github.com'), seg('specscore'), seg('specscore')];
    const result = canonicalPathMatcher(segments, {} as never, {} as never);
    expect(result).toEqual({ consumed: segments });
  });

  it('matches a multi-segment URL and consumes all segments', () => {
    const segments = [
      seg('github.com'),
      seg('specscore'),
      seg('specscore'),
      seg('spec'),
      seg('features'),
      seg('foo'),
    ];
    const result = canonicalPathMatcher(segments, {} as never, {} as never);
    expect(result?.consumed).toHaveLength(6);
  });

  it('returns null for fewer than 3 segments', () => {
    expect(canonicalPathMatcher([seg('github.com')], {} as never, {} as never)).toBeNull();
    expect(
      canonicalPathMatcher([seg('github.com'), seg('org')], {} as never, {} as never),
    ).toBeNull();
  });

  it('returns null for handle-shape URLs (segment 0 starts with ~)', () => {
    // Handle shape `/~acme/platform/...` is reserved for Task 4 — for now it
    // falls through to the next route configuration.
    const segments = [seg('~acme'), seg('platform'), seg('spec')];
    expect(canonicalPathMatcher(segments, {} as never, {} as never)).toBeNull();
  });
});

describe('urlSchemeGuard', () => {
  beforeEach(() => {
    // provideRouter gives the guard a Router to construct UrlTrees on
    // rejection paths.
    TestBed.configureTestingModule({
      providers: [provideRouter([])],
    });
  });

  it('parses a bare repo URL into coordinates with empty path', () => {
    const allow = runGuard({
      url: [seg('github.com'), seg('specscore'), seg('specscore')],
    });

    const service = TestBed.inject(UrlSchemeCoordinatesService);
    expect(allow).toBe(true);
    expect(service.coordinates()).toEqual({
      kind: 'path',
      git_host: 'github.com',
      org: 'specscore',
      repo: 'specscore',
      path: '',
    });
  });

  it('parses a deep artifact URL with multi-segment path', () => {
    const allow = runGuard({
      url: [
        seg('github.com'),
        seg('specscore'),
        seg('specscore'),
        seg('spec'),
        seg('features'),
        seg('feature'),
        seg('README.md'),
      ],
    });

    const service = TestBed.inject(UrlSchemeCoordinatesService);
    expect(allow).toBe(true);
    expect(service.coordinates()).toEqual({
      kind: 'path',
      git_host: 'github.com',
      org: 'specscore',
      repo: 'specscore',
      path: 'spec/features/feature/README.md',
    });
  });

  it('rejects an unknown host with a UrlTree to /project/unsupported-source', () => {
    const result = runGuard({
      url: [seg('evil.example'), seg('foo'), seg('bar')],
    });

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/project/unsupported-source');
  });

  it('rejects a Cyrillic-homoglyph host with a UrlTree to /project/unsupported-source', () => {
    // First character is U+0456 (Cyrillic) — NOT github.com.
    const result = runGuard({
      url: [seg('gіthub.com'), seg('foo'), seg('bar')],
    });

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/project/unsupported-source');
  });

  it('does not populate coordinates service on rejection', () => {
    const service = TestBed.inject(UrlSchemeCoordinatesService);
    service.set(null);
    runGuard({ url: [seg('evil.example'), seg('foo'), seg('bar')] });
    expect(service.coordinates()).toBeNull();
  });
});
