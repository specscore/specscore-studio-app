import { TestBed } from '@angular/core/testing';
import { UrlSegment, UrlTree, convertToParamMap, provideRouter } from '@angular/router';
import type { ActivatedRouteSnapshot, ParamMap } from '@angular/router';
import {
  UrlSchemeCoordinatesService,
  canonicalPathMatcher,
  handlePathMatcher,
  isPathSegmentValid,
  urlSchemeGuard,
} from './url-scheme.guard';

/** Helper: build a UrlSegment from a raw path string. */
function seg(path: string): UrlSegment {
  return new UrlSegment(path, {});
}

/** Empty query-param map for snapshots whose tests don't care about ?ref/?op. */
const EMPTY_PARAMS: ParamMap = convertToParamMap({});

/**
 * Helper: invoke the functional guard inside an Angular injection context.
 * The guard returns true | UrlTree depending on validation outcome.
 */
function runGuard(snapshot: Partial<ActivatedRouteSnapshot>): boolean | UrlTree {
  const full = {
    queryParamMap: EMPTY_PARAMS,
    ...snapshot,
  } as ActivatedRouteSnapshot;
  return TestBed.runInInjectionContext(() =>
    urlSchemeGuard(full, { url: '' } as never),
  ) as boolean | UrlTree;
}

describe('canonicalPathMatcher', () => {
  it('matches a 3-segment URL whose first segment contains "."', () => {
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

  it('returns null when segment 0 has no "." (REQ:first-segment-dispatch)', () => {
    // App-route literals like 'landing', 'settings' must not be shadowed by
    // the canonical matcher. The dot rule is structural — no reserved-word
    // list needed.
    const segments = [seg('landing'), seg('foo'), seg('bar')];
    expect(canonicalPathMatcher(segments, {} as never, {} as never)).toBeNull();
  });

  it('returns null for handle-shape URLs (segment 0 starts with ~)', () => {
    // Handle shape `/~acme/...` is dispatched by handlePathMatcher;
    // this matcher rejects it so the router picks the right route.
    const segments = [seg('~acme'), seg('platform'), seg('spec')];
    expect(canonicalPathMatcher(segments, {} as never, {} as never)).toBeNull();
  });
});

describe('handlePathMatcher', () => {
  it('matches a single-segment handle URL (bare ~handle)', () => {
    const segments = [seg('~acme')];
    const result = handlePathMatcher(segments, {} as never, {} as never);
    expect(result).toEqual({ consumed: segments });
  });

  it('matches a multi-segment handle URL with trailing path', () => {
    const segments = [seg('~acme'), seg('spec'), seg('login.md')];
    const result = handlePathMatcher(segments, {} as never, {} as never);
    expect(result?.consumed).toHaveLength(3);
  });

  it('returns null for zero segments', () => {
    expect(handlePathMatcher([], {} as never, {} as never)).toBeNull();
  });

  it('returns null for non-handle URLs (no ~ prefix)', () => {
    const segments = [seg('github.com'), seg('foo')];
    expect(handlePathMatcher(segments, {} as never, {} as never)).toBeNull();
  });

  it('returns null for a bare `~` segment (no actual handle)', () => {
    const segments = [seg('~'), seg('foo')];
    expect(handlePathMatcher(segments, {} as never, {} as never)).toBeNull();
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

  it('rejects an unknown host with a UrlTree to /unsupported-source', () => {
    const result = runGuard({
      url: [seg('evil.example'), seg('foo'), seg('bar')],
    });

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/unsupported-source');
  });

  it('rejects a Cyrillic-homoglyph host with a UrlTree to /unsupported-source', () => {
    // First character is U+0456 (Cyrillic) — NOT github.com.
    const result = runGuard({
      url: [seg('gіthub.com'), seg('foo'), seg('bar')],
    });

    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/unsupported-source');
  });

  it('does not populate coordinates service on host rejection', () => {
    const service = TestBed.inject(UrlSchemeCoordinatesService);
    service.set(null);
    runGuard({ url: [seg('evil.example'), seg('foo'), seg('bar')] });
    expect(service.coordinates()).toBeNull();
  });

  it('preserves URL-decoded characters without re-decoding (REQ:path-decoding-once)', () => {
    // Angular has already decoded `%20` → ' '. The guard must leave the
    // decoded value alone and MUST NOT call decodeURIComponent again.
    const allow = runGuard({
      url: [
        seg('github.com'),
        seg('foo'),
        seg('bar'),
        seg('spec'),
        seg('features'),
        seg('with space.md'),
      ],
    });

    const service = TestBed.inject(UrlSchemeCoordinatesService);
    expect(allow).toBe(true);
    expect(service.coordinates()).toEqual({
      kind: 'path',
      git_host: 'github.com',
      org: 'foo',
      repo: 'bar',
      path: 'spec/features/with space.md',
    });
  });

  it('rejects a path traversal segment (..)', () => {
    const result = runGuard({
      url: [seg('github.com'), seg('foo'), seg('bar'), seg('spec'), seg('..'), seg('etc')],
    });
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/unsupported-source');
  });

  it('rejects a single-dot segment (.)', () => {
    const result = runGuard({
      url: [seg('github.com'), seg('foo'), seg('bar'), seg('.')],
    });
    expect(result).toBeInstanceOf(UrlTree);
  });

  it('rejects a path containing a null byte (decoded %00)', () => {
    const result = runGuard({
      url: [seg('github.com'), seg('foo'), seg('bar'), seg('login\u0000.md')],
    });
    expect(result).toBeInstanceOf(UrlTree);
  });

  it('rejects a path containing a control character (U+001F)', () => {
    const result = runGuard({
      url: [seg('github.com'), seg('foo'), seg('bar'), seg('hidden\u001Ffile.md')],
    });
    expect(result).toBeInstanceOf(UrlTree);
  });

  it('rejects a path containing DEL (U+007F)', () => {
    const result = runGuard({
      url: [seg('github.com'), seg('foo'), seg('bar'), seg('weird\u007F.md')],
    });
    expect(result).toBeInstanceOf(UrlTree);
  });

  it('rejects an encoded slash (decoded %2F appears as literal / inside a segment)', () => {
    const result = runGuard({
      url: [seg('github.com'), seg('foo'), seg('bar'), seg('spec/login.md')],
    });
    expect(result).toBeInstanceOf(UrlTree);
  });

  it('does not populate coordinates service on path rejection', () => {
    const service = TestBed.inject(UrlSchemeCoordinatesService);
    service.set(null);
    runGuard({
      url: [seg('github.com'), seg('foo'), seg('bar'), seg('..')],
    });
    expect(service.coordinates()).toBeNull();
  });

  it('parses a canonical handle URL into handle coordinates (REQ:handle-canonical-route)', () => {
    const allow = runGuard({
      url: [seg('~acme'), seg('spec'), seg('features'), seg('login.md')],
    });

    const service = TestBed.inject(UrlSchemeCoordinatesService);
    expect(allow).toBe(true);
    expect(service.coordinates()).toEqual({
      kind: 'handle',
      handle: 'acme',
      path: 'spec/features/login.md',
    });
  });

  it('parses a bare handle URL with empty path', () => {
    const allow = runGuard({
      url: [seg('~acme')],
    });

    const service = TestBed.inject(UrlSchemeCoordinatesService);
    expect(allow).toBe(true);
    expect(service.coordinates()).toEqual({
      kind: 'handle',
      handle: 'acme',
      path: '',
    });
  });

  it('rejects a handle containing a dot (REQ:handle-no-dots)', () => {
    const result = runGuard({
      url: [seg('~acme.io')],
    });
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/unsupported-source');
  });

  it('does not populate coordinates service on handle dot rejection', () => {
    const service = TestBed.inject(UrlSchemeCoordinatesService);
    service.set(null);
    runGuard({ url: [seg('~acme.io')] });
    expect(service.coordinates()).toBeNull();
  });

  it('applies path validation to handle-shape trailing path', () => {
    const result = runGuard({
      url: [seg('~acme'), seg('..'), seg('etc')],
    });
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/unsupported-source');
  });

  it('extracts ?ref onto path coordinates (REQ:ref-query-param)', () => {
    runGuard({
      url: [seg('github.com'), seg('specscore'), seg('specscore')],
      queryParamMap: convertToParamMap({ ref: 'feature/login' }),
    });
    expect(TestBed.inject(UrlSchemeCoordinatesService).coordinates()).toMatchObject({
      kind: 'path',
      ref: 'feature/login',
    });
  });

  it('preserves slashes in ?ref values (e.g. feature/x) without re-decoding', () => {
    // ParamMap already URL-decodes once; whether the URL sent `feature/x` or
    // `feature%2Fx`, Angular hands us `feature/x` here. The guard must NOT
    // re-decode and MUST preserve `/`.
    runGuard({
      url: [seg('github.com'), seg('specscore'), seg('specscore')],
      queryParamMap: convertToParamMap({ ref: 'release/v1.2.3' }),
    });
    expect(TestBed.inject(UrlSchemeCoordinatesService).coordinates()?.ref).toBe('release/v1.2.3');
  });

  it('exposes ref:undefined when ?ref is absent (REQ:ref-query-param default behavior)', () => {
    runGuard({
      url: [seg('github.com'), seg('specscore'), seg('specscore')],
    });
    expect(TestBed.inject(UrlSchemeCoordinatesService).coordinates()?.ref).toBeUndefined();
  });

  it('normalizes an empty ?ref to undefined', () => {
    runGuard({
      url: [seg('github.com'), seg('specscore'), seg('specscore')],
      queryParamMap: convertToParamMap({ ref: '' }),
    });
    expect(TestBed.inject(UrlSchemeCoordinatesService).coordinates()?.ref).toBeUndefined();
  });

  it('extracts ?op onto path coordinates (REQ:op-query-param)', () => {
    runGuard({
      url: [seg('github.com'), seg('specscore'), seg('specscore')],
      queryParamMap: convertToParamMap({ op: 'explore' }),
    });
    expect(TestBed.inject(UrlSchemeCoordinatesService).coordinates()).toMatchObject({
      kind: 'path',
      op: 'explore',
    });
  });

  it('extracts both ?ref and ?op together', () => {
    runGuard({
      url: [seg('github.com'), seg('specscore'), seg('specscore')],
      queryParamMap: convertToParamMap({ ref: 'main', op: 'edit' }),
    });
    expect(TestBed.inject(UrlSchemeCoordinatesService).coordinates()).toMatchObject({
      ref: 'main',
      op: 'edit',
    });
  });

  it('extracts ?ref and ?op onto handle coordinates too', () => {
    runGuard({
      url: [seg('~acme')],
      queryParamMap: convertToParamMap({ ref: 'main', op: 'ask' }),
    });
    expect(TestBed.inject(UrlSchemeCoordinatesService).coordinates()).toMatchObject({
      kind: 'handle',
      ref: 'main',
      op: 'ask',
    });
  });
});

describe('isPathSegmentValid', () => {
  it('accepts ordinary filename segments', () => {
    expect(isPathSegmentValid('README.md')).toBe(true);
    expect(isPathSegmentValid('with space.md')).toBe(true);
    expect(isPathSegmentValid('foo-bar_baz.txt')).toBe(true);
    expect(isPathSegmentValid('')).toBe(true); // intermediate empty segments are not unsafe
  });

  it('rejects path-traversal and current-dir tokens', () => {
    expect(isPathSegmentValid('..')).toBe(false);
    expect(isPathSegmentValid('.')).toBe(false);
    expect(isPathSegmentValid('foo..bar')).toBe(false); // substring match per Feature
  });

  it('accepts a dot inside a filename (e.g. extensions)', () => {
    expect(isPathSegmentValid('file.txt')).toBe(true);
    expect(isPathSegmentValid('.eslintrc')).toBe(true); // leading dot, no traversal
  });

  it('rejects null bytes and control characters', () => {
    expect(isPathSegmentValid('login\u0000.md')).toBe(false);
    expect(isPathSegmentValid('a\u001Fb')).toBe(false);
    expect(isPathSegmentValid('a\u007Fb')).toBe(false);
  });

  it('rejects literal slashes (decoded %2F)', () => {
    expect(isPathSegmentValid('spec/login.md')).toBe(false);
    expect(isPathSegmentValid('/etc/passwd')).toBe(false);
  });
});
