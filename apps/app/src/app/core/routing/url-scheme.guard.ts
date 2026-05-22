// URL-scheme route guard for the canonical Studio deep-link contract defined
// in spec/features/studio-url-scheme/README.md (and ADR D-0001 upstream).
//
// Layered construction:
//   - Task 1: parser scaffolding + UrlMatcher + UrlSchemeCoordinatesService.
//   - Task 2: forge-host allow-list with IDNA normalization.
//   - Task 3 (current): path-validation pipeline — `..`, single `.`, control
//     characters (incl. null byte from `%00`), and encoded slash (`%2F`).
//   - Task 4: handle-namespace parsing (`~{handle}/{project-slug}`).
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

/** Parsed coordinates from a canonical path-shape URL. */
export interface PathCoordinates {
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
 * (`/app/project/~{handle}/{project-slug}/{path}`). Per
 * REQ:handle-canonical-route, this shape only reserves the route — the
 * resolution from `{handle, project_slug}` to a concrete forge repository
 * is a future feature.
 */
export interface HandleCoordinates {
  readonly kind: 'handle';
  /** The handle namespace (segment 0 with the leading `~` stripped). MUST
   *  NOT contain `.` per REQ:handle-no-dots — the guard rejects dot-bearing
   *  handles to UnsupportedSourceComponent before producing this shape. */
  readonly handle: string;
  readonly project_slug: string;
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
 * Custom UrlMatcher for the canonical path shape. Matches when the route has
 * at least 3 segments (`{git_host}/{org}/{repo}` minimum). Consumes ALL
 * remaining segments so the guard can pick the trailing `{path}` from
 * `route.url`. Returns null on fewer than 3 segments — Angular's router then
 * tries subsequent route configurations.
 *
 * Handle-shape URLs (leading `~` on segment 0) are handled by the sibling
 * `handlePathMatcher` below; this matcher rejects them so the router can
 * dispatch to the right route configuration.
 */
export const canonicalPathMatcher: UrlMatcher = (segments) => {
  if (segments.length < 3) return null;
  if (segments[0].path.startsWith('~')) return null;
  return { consumed: segments };
};

/**
 * Custom UrlMatcher for the canonical handle shape
 * (`/~{handle}/{project-slug}/{path}`). Matches when:
 *   - Segment 0 starts with `~` AND has more characters after it (a bare `~`
 *     is meaningless).
 *   - The URL has at least 2 segments (`~{handle}` and `{project-slug}`).
 *
 * The dot-in-handle check (REQ:handle-no-dots) lives in the guard, not
 * here — so a `~acme.io/platform` URL still routes to the project surface
 * and gets rejected to UnsupportedSourceComponent with a UrlTree, instead
 * of falling through to the 404 page (which would be misleading UX).
 */
export const handlePathMatcher: UrlMatcher = (segments) => {
  if (segments.length < 2) return null;
  const first = segments[0].path;
  if (!first.startsWith('~') || first.length < 2) return null;
  return { consumed: segments };
};

function rejectToUnsupportedSource(): UrlTree {
  return inject(Router).createUrlTree(['/project/unsupported-source']);
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
 *   1. Handle MUST NOT contain `.` (REQ:handle-no-dots) — guarantees a
 *      handle segment can never collide with a `{git_host}` segment which
 *      always contains at least one `.`.
 *   2. Path-segment validation (same as above).
 *
 * On rejection at any stage, returns a UrlTree to
 * `/project/unsupported-source` so the Angular router renders
 * UnsupportedSourceComponent instead of the project chrome (per
 * REQ:unknown-host-rejection — no phishing surface). The coordinates
 * service is NOT populated on rejection.
 */
export const urlSchemeGuard: CanActivateFn = (route): boolean | UrlTree => {
  const segs = route.url;
  if (segs.length < 2) return true; // matchers guarantee minimums; defensive.

  // Handle shape: segment 0 starts with `~`. handlePathMatcher routes us here
  // when length >= 2 and the prefix is present.
  if (segs[0].path.startsWith('~')) {
    const handle = segs[0].path.slice(1); // strip leading `~`
    if (handle.length === 0 || handle.includes('.')) {
      return rejectToUnsupportedSource();
    }
    const projectSlug = segs[1].path;
    const rest = segs.slice(2);
    if (!arePathSegmentsValid(rest)) {
      return rejectToUnsupportedSource();
    }
    inject(UrlSchemeCoordinatesService).set({
      kind: 'handle',
      handle,
      project_slug: projectSlug,
      path: rest.map((s) => s.path).join('/'),
    });
    return true;
  }

  // Path shape: canonicalPathMatcher guarantees >= 3 segments.
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
  });
  return true;
};
