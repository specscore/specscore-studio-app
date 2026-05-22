import { Routes } from '@angular/router';
import { ProjectSpecPage } from './project-spec-page';
import {
  canonicalPathMatcher,
  handlePathMatcher,
  urlSchemeGuard,
} from '@/app/core/routing/url-scheme.guard';

export default [
  // Bare /project renders the unsupported-source component. The canonical
  // scheme requires /{git_host}/{org}/{repo} (or /~{handle}/{project-slug}),
  // so a bare /project is meaningless — show unsupported-source instead of
  // leaving the router-outlet empty.
  {
    path: '',
    loadComponent: () =>
      import('./unsupported-source').then(m => m.UnsupportedSourceComponent),
  },
  // NOTE: literal sub-route paths MUST be declared BEFORE the canonical-path
  // matcher below — otherwise the matcher would consume e.g. /project/features
  // as `{git_host: 'features'}` instead of routing to ProjectSpecPage.
  //
  // ProjectSpecPage's sibling routes below (features/plans/etc.) still use
  // their own pre-canonical scheme; cleaning those up is out of scope for
  // this Plan and belongs in a follow-up.
  {
    path: 'features',
    component: ProjectSpecPage,
    data: { title: 'Features', specDir: 'features' },
  },
  {
    path: 'plans',
    component: ProjectSpecPage,
    data: { title: 'Plans', specDir: 'plans' },
  },
  {
    path: 'architecture',
    component: ProjectSpecPage,
    data: { title: 'Architecture', specDir: 'architecture' },
  },
  {
    path: 'tests',
    component: ProjectSpecPage,
    data: { title: 'Tests', specDir: 'tests' },
  },
  // Rejection landing for URLs that fail the canonical URL-scheme contract
  // (unknown host, path traversal, etc.) — see url-scheme.guard.ts.
  {
    path: 'unsupported-source',
    loadComponent: () =>
      import('./unsupported-source').then(m => m.UnsupportedSourceComponent),
  },
  // Canonical handle shape per spec/features/studio-url-scheme:
  // /app/project/~{handle}/{project-slug}/{path}
  // Declared before the path matcher so `~`-prefixed URLs dispatch here.
  {
    matcher: handlePathMatcher,
    canActivate: [urlSchemeGuard],
    loadComponent: () => import('./project-page').then(m => m.ProjectPage),
  },
  // Canonical path shape per spec/features/studio-url-scheme:
  // /app/project/{git_host}/{org}/{repo}/{path}
  // The matcher accepts 3+ segments; urlSchemeGuard parses and writes the
  // coordinates to UrlSchemeCoordinatesService for the page to consume.
  {
    matcher: canonicalPathMatcher,
    canActivate: [urlSchemeGuard],
    loadComponent: () => import('./project-page').then(m => m.ProjectPage),
  },
] as Routes;
