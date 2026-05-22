import { Routes } from '@angular/router';
import { ProjectSpecPage } from './project-spec-page';
import { canonicalPathMatcher, urlSchemeGuard } from '@/app/core/routing/url-scheme.guard';

export default [
  {
    path: '',
    loadComponent: () => import('./project-page').then(m => m.ProjectPage),
  },
  // NOTE: literal sub-route paths MUST be declared BEFORE the canonical-path
  // matcher below — otherwise the matcher would consume e.g. /project/features
  // as `{git_host: 'features'}` instead of routing to ProjectSpecPage.
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
