import { Routes } from '@angular/router';
import { AppLayout } from './layout/component/app.layout';
import { AppHeaderLayout } from './layout/component/app.header-layout';
import {
  canonicalPathMatcher,
  handlePathMatcher,
  urlSchemeGuard,
} from './core/routing/url-scheme.guard';

export const appRoutes: Routes = [
    {
        path: '',
        component: AppHeaderLayout,
        children: [
            { path: '', loadComponent: () => import('./pages/home/home').then(m => m.Home) },
        ]
    },
    {
        path: '',
        component: AppLayout,
        children: [
            { path: 'prime-demos', loadChildren: () => import('./pages/prime-demos/prime-demos.routes') },
            // Unsupported-source landing — REQ:unknown-host-rejection target.
            // The literal sits BEFORE the canonical matcher so the matcher
            // (which requires segment 0 to contain `.`) can't shadow it; the
            // explicit literal is still clearer than relying on the dispatch
            // rule alone.
            {
                path: 'unsupported-source',
                loadComponent: () =>
                    import('./pages/project/unsupported-source').then(m => m.UnsupportedSourceComponent),
            },
            // Canonical handle shape per studio-url-scheme:
            // /app/~{handle}[/{path}]
            // Declared before the path matcher so `~`-prefixed URLs dispatch here.
            // runGuardsAndResolvers:'always' so the guard re-parses coordinates
            // when the URL path changes within the same matched route (e.g.
            // navigating from /app/~acme to /app/~acme/spec/features keeps the
            // same component instance but needs fresh coords for the page).
            {
                matcher: handlePathMatcher,
                canActivate: [urlSchemeGuard],
                runGuardsAndResolvers: 'always',
                loadComponent: () => import('./pages/project/project-page').then(m => m.ProjectPage),
            },
            // Canonical path shape per studio-url-scheme:
            // /app/{git_host}/{org}/{repo}[/{path}]
            // The matcher accepts 3+ segments and requires segment 0 to contain `.`
            // (REQ:first-segment-dispatch); urlSchemeGuard parses and validates.
            // Same runGuardsAndResolvers reasoning as the handle route above —
            // navigating from /app/{host}/{org}/{repo} to /app/{host}/{org}/{repo}/spec/features
            // is the same matched route with different segments; the guard must
            // re-run so coordinates update.
            {
                matcher: canonicalPathMatcher,
                canActivate: [urlSchemeGuard],
                runGuardsAndResolvers: 'always',
                loadComponent: () => import('./pages/project/project-page').then(m => m.ProjectPage),
            },
        ]
    },
    { path: 'landing', loadComponent: () => import('./pages/landing/landing').then(m => m.Landing) },
    { path: 'auth', loadChildren: () => import('./pages/auth/auth.routes') },
    { path: '**', loadComponent: () => import('./pages/notfound/notfound').then(m => m.Notfound) }
];
