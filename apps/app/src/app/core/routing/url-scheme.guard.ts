// URL-scheme route guard for the canonical Studio deep-link contract defined
// in spec/features/studio-url-scheme/README.md (and ADR D-0001 upstream).
//
// Task 1 (this file's initial revision) wires the parser scaffolding for the
// canonical path shape `/app/project/{git_host}/{org}/{repo}/{path}` and
// exposes the parsed coordinates to the project page via a signal-based
// service. No host or path validation lives here yet — those layers land in
// Tasks 2 and 3 (allow-list, path validation, handle parsing, query params).
//
// Architecture (see spec/features/studio-url-scheme/README.md ## Architecture):
//   - This guard is the single funnel through which parsed coordinates flow.
//   - Downstream consumers (ProjectPage) MUST read coordinates from
//     UrlSchemeCoordinatesService and MUST NOT re-parse the URL.

import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { CanActivateFn, UrlMatcher, UrlTree } from '@angular/router';
import { isAllowedForgeHost } from './forge-host.allowlist';

/** Parsed coordinates from a canonical path-shape URL. */
export interface PathCoordinates {
  readonly kind: 'path';
  readonly git_host: string;
  readonly org: string;
  readonly repo: string;
  /** Joined trailing segments (may be empty). Already URL-segment-decoded by
   *  the Angular router. Single-decode contract per REQ:path-decoding-once
   *  will be enforced in Task 3. */
  readonly path: string;
}

export type UrlSchemeCoordinates = PathCoordinates;

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

/**
 * Custom UrlMatcher for the canonical path shape. Matches when the route has
 * at least 3 segments (`{git_host}/{org}/{repo}` minimum). Consumes ALL
 * remaining segments so the guard can pick the trailing `{path}` from
 * `route.url`. Returns null on fewer than 3 segments — Angular's router then
 * tries subsequent route configurations.
 *
 * No content validation here: host allow-list and path traversal checks land
 * in Tasks 2 and 3. Handle namespace (`~{handle}/{project-slug}`) lands in
 * Task 4 and will extend this matcher (or add a sibling matcher).
 */
export const canonicalPathMatcher: UrlMatcher = (segments) => {
  if (segments.length < 3) return null;
  // Reject handle-shape URLs (leading `~` on segment 0) — Task 4 will add a
  // dedicated handle matcher. For Task 1 they fall through to the next route.
  if (segments[0].path.startsWith('~')) return null;
  return { consumed: segments };
};

/**
 * Functional CanActivate guard that parses the canonical path coordinates
 * from the activated route snapshot, validates them, and writes them to
 * UrlSchemeCoordinatesService.
 *
 * Current validations:
 *   - Task 2: forge-host allow-list with IDNA normalization.
 *
 * On rejection, returns a UrlTree to `/project/unsupported-source` so the
 * Angular router renders UnsupportedSourceComponent instead of the project
 * chrome (per REQ:unknown-host-rejection — no phishing surface). The
 * coordinates service is NOT populated on rejection so downstream consumers
 * cannot accidentally observe the rejected input.
 *
 * Future tasks layer in additional validations:
 *   - Task 3: path-validation pipeline (traversal, control chars, %2F, %00).
 *   - Task 4: handle-namespace dot rejection.
 */
export const urlSchemeGuard: CanActivateFn = (route): boolean | UrlTree => {
  const segs = route.url;
  // canonicalPathMatcher guarantees segs.length >= 3 — defensive check below.
  if (segs.length < 3) return true;
  const [host, org, repo, ...rest] = segs;

  if (!isAllowedForgeHost(host.path)) {
    return inject(Router).createUrlTree(['/project/unsupported-source']);
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
