// URL-scheme route guard for the canonical Studio deep-link contract defined
// in spec/features/studio-url-scheme/README.md (and ADR D-0001 upstream).
//
// Mounted at the top level of /app/ per the D-0001 amendment. The router's
// first-segment dispatch rule (REQ:first-segment-dispatch) selects between:
//   - Forge canonical: segment 0 contains "."  → canonicalPathMatcher
//   - Handle reservation: segment 0 starts with "~" → handlePathMatcher
//   - App-route literal (landing, auth, settings, unsupported-source): never
//     contains "." and is matched by Angular's literal route configuration
//     before the matchers below run.
//   - Otherwise: 404.
//
// Architecture (see spec/features/studio-url-scheme/README.md ## Architecture):
//   - This guard is the single funnel through which parsed coordinates flow.
//   - Downstream consumers (ProjectPage) MUST read coordinates from
//     UrlSchemeCoordinatesService and MUST NOT re-parse the URL.
//   - The Angular router already URL-segment-decodes each segment once before
//     handing them to the guard via `route.url`. We do NOT re-decode — that
//     would violate REQ:path-decoding-once and silently allow double-encoded
//     traversal attacks (e.g. `%252Fetc%252Fpasswd`).

import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { CanActivateFn, UrlMatcher, UrlTree, UrlSegment } from '@angular/router';
import { isAllowedForgeHost } from './forge-host.allowlist';

/**
 * Optional query-parameter contract shared by both URL shapes per
 * REQ:ref-query-param and REQ:op-query-param.
 *
 *   - `ref`: a git reference (branch | tag | sha). Already URL-decoded once
 *     by Angular's QueryParamMap; downstream consumers MUST NOT re-decode.
 *     When `undefined`, the page resolves at the repository's default
 *     branch (REQ:ref-query-param).
 *   - `op`: a Studio operation (initial set: 'explore', 'edit', 'ask',
 *     'request-change'). The set is extensible — additions are code
 *     changes inside the page component. Undefined means "default read view".
 */
export interface QueryParamCoordinates {
  readonly ref?: string;
  readonly op?: string;
}

/** Parsed coordinates from a canonical path-shape URL
 *  (`/app/{git_host}/{org}/{repo}[/{path}]`). */
export interface PathCoordinates extends QueryParamCoordinates {
  readonly kind: 'path';
  readonly git_host: string;
  readonly org: string;
  readonly repo: string;
  /** Joined trailing segments (may be empty). Already URL-segment-decoded
   *  exactly once by Angular's UrlSerializer; never re-decoded downstream. */
  readonly path: string;
}

/**
 * Parsed coordinates from a canonical handle-shape URL
 * (`/app/~{handle}[/{path}]`). Per REQ:handle-canonical-route, this shape
 * only reserves the route — the resolution from `{handle}` to a concrete
 * forge repository is a future feature. The earlier `{project-slug}`
 * component was dropped per the D-0001 amendment; slug grammar is deferred
 * to whichever Feature implements the resolver.
 */
export interface HandleCoordinates extends QueryParamCoordinates {
  readonly kind: 'handle';
  /** The handle namespace (segment 0 with the leading `~` stripped). MUST
   *  NOT contain `.` per REQ:handle-no-dots — the guard rejects dot-bearing
   *  handles to UnsupportedSourceComponent before producing this shape. */
  readonly handle: string;
  /** Joined trailing segments (may be empty). Already URL-segment-decoded
   *  exactly once; subject to the same path-validation pipeline as the
   *  path-shape coordinates. */
  readonly path: string;
}

export type UrlSchemeCoordinates = PathCoordinates | HandleCoordinates;

/**
 * Holds the most recently parsed URL-scheme coordinates. Set by
 * `urlSchemeGuard`; read by the project page component. A signal lets the
 * page react to coordinate changes if the URL changes without unmounting.
 */
@Injectable({ providedIn: 'root' })
export class UrlSchemeCoordinatesService {
  private readonly _coordinates = signal<UrlSchemeCoordinates | null>(null);
  readonly coordinates = this._coordinates.asReadonly();

  set(coords: UrlSchemeCoordinates | null): void {
    this._coordinates.set(coords);
  }
}

/** Control characters U+0000–U+001F and U+007F per REQ:path-traversal-rejection. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/;

/**
 * Validate a single already-decoded path segment per
 * REQ:path-traversal-rejection. Reject if the segment:
 *   - contains the substring `..` (path traversal — Feature lists it as a
 *     "sequence" rather than a "complete segment"),
 *   - is exactly `.` (current-directory reference — complete-segment form),
 *   - contains a control character (U+0000–U+001F or U+007F — covers the
 *     null-byte case from `%00` after Angular's segment decoding),
 *   - contains a literal `/`. A `/` inside a decoded segment can only have
 *     arrived as `%2F` in the raw URL, because the URL serializer splits on
 *     literal slashes before decoding each segment.
 */
export function isPathSegmentValid(segment: string): boolean {
  if (segment === '.') return false;
  if (segment.includes('..')) return false;
  if (segment.includes('/')) return false;
  if (CONTROL_CHAR_RE.test(segment)) return false;
  return true;
}

/** Returns true iff every segment in the trailing path is valid. */
function arePathSegmentsValid(pathSegments: UrlSegment[]): boolean {
  return pathSegments.every((s) => isPathSegmentValid(s.path));
}

/**
 * Custom UrlMatcher for the canonical path shape per REQ:path-canonical-route +
 * REQ:first-segment-dispatch. Matches when:
 *   - The URL has at least 3 segments (`{git_host}/{org}/{repo}` minimum), AND
 *   - Segment 0 contains a `.` (the structural dispatch rule that distinguishes
 *     a forge host from an app-route literal). The host allow-list is enforced
 *     separately in the guard.
 *
 * Consumes ALL remaining segments so the guard can pick the trailing `{path}`
 * from `route.url`. Returns null when the URL doesn't match — Angular's router
 * then tries subsequent route configurations.
 *
 * Handle-shape URLs (leading `~` on segment 0) are handled by the sibling
 * `handlePathMatcher` below.
 */
export const canonicalPathMatcher: UrlMatcher = (segments) => {
  if (segments.length < 3) return null;
  const first = segments[0].path;
  if (!first.includes('.')) return null;
  if (first.startsWith('~')) return null;
  return { consumed: segments };
};

/**
 * Custom UrlMatcher for the canonical handle shape (`/~{handle}[/{path}]`).
 * Matches when:
 *   - The URL has at least 1 segment, AND
 *   - Segment 0 starts with `~` AND has more characters after it (a bare `~`
 *     is meaningless).
 *
 * Per the D-0001 amendment, the handle shape is a single-segment reservation
 * — no `{project-slug}` component. Trailing segments are the artifact `{path}`.
 *
 * The dot-in-handle check (REQ:handle-no-dots) lives in the guard, not
 * here — so a `~acme.io` URL still routes to the project surface and gets
 * rejected to UnsupportedSourceComponent with a UrlTree, instead of falling
 * through to the 404 page (which would be misleading UX).
 */
export const handlePathMatcher: UrlMatcher = (segments) => {
  if (segments.length === 0) return null;
  const first = segments[0].path;
  if (!first.startsWith('~') || first.length < 2) return null;
  return { consumed: segments };
};

function rejectToUnsupportedSource(): UrlTree {
  return inject(Router).createUrlTree(['/unsupported-source']);
}

/**
 * Extract the `?ref` and `?op` query parameters per REQ:ref-query-param and
 * REQ:op-query-param. Angular's QueryParamMap already URL-decodes once, so
 * a `?ref=feature%2Fx` arrives as `feature/x` here; we do not re-decode.
 * Returns an object whose properties are `undefined` when absent — never
 * empty-string — so consumers can distinguish "not specified" from
 * "explicitly empty". An empty-string value coming from the URL is also
 * normalized to `undefined` to keep that distinction clean.
 */
function extractQueryParams(
  queryParamMap: { get(name: string): string | null },
): QueryParamCoordinates {
  const ref = queryParamMap.get('ref');
  const op = queryParamMap.get('op');
  return {
    ref: ref && ref.length > 0 ? ref : undefined,
    op: op && op.length > 0 ? op : undefined,
  };
}

/**
 * Functional CanActivate guard that parses the canonical URL-scheme
 * coordinates (path-shape OR handle-shape) from the activated route
 * snapshot, validates them, and writes them to
 * UrlSchemeCoordinatesService.
 *
 * Path-shape validation pipeline (each stage gates the next):
 *   1. Forge-host allow-list (REQ:host-allowlist, REQ:host-idna-normalization).
 *   2. Path-segment validation (REQ:path-traversal-rejection,
 *      REQ:path-decoding-once via "decode-then-check, never re-decode").
 *
 * Handle-shape validation pipeline:
 *   1. Handle MUST NOT contain `.` (REQ:handle-no-dots).
 *   2. Path-segment validation (same as above).
 *
 * On rejection at any stage, returns a UrlTree to `/unsupported-source` so
 * the Angular router renders UnsupportedSourceComponent instead of the
 * project chrome (per REQ:unknown-host-rejection — no phishing surface).
 * The coordinates service is NOT populated on rejection.
 */
export const urlSchemeGuard: CanActivateFn = (route): boolean | UrlTree => {
  const segs = route.url;
  if (segs.length === 0) return true; // defensive — matchers guarantee >= 1.

  const query = extractQueryParams(route.queryParamMap);

  // Handle shape: segment 0 starts with `~`. handlePathMatcher routes us here.
  if (segs[0].path.startsWith('~')) {
    const handle = segs[0].path.slice(1); // strip leading `~`
    if (handle.length === 0 || handle.includes('.')) {
      return rejectToUnsupportedSource();
    }
    const rest = segs.slice(1);
    if (!arePathSegmentsValid(rest)) {
      return rejectToUnsupportedSource();
    }
    inject(UrlSchemeCoordinatesService).set({
      kind: 'handle',
      handle,
      path: rest.map((s) => s.path).join('/'),
      ...query,
    });
    return true;
  }

  // Path shape: canonicalPathMatcher guarantees >= 3 segments and segment 0
  // contains a `.`.
  if (segs.length < 3) return true;
  const [host, org, repo, ...rest] = segs;

  if (!isAllowedForgeHost(host.path)) {
    return rejectToUnsupportedSource();
  }
  if (!arePathSegmentsValid(rest)) {
    return rejectToUnsupportedSource();
  }
  inject(UrlSchemeCoordinatesService).set({
    kind: 'path',
    git_host: host.path,
    org: org.path,
    repo: repo.path,
    path: rest.map((s) => s.path).join('/'),
    ...query,
  });
  return true;
};
