import { Routes } from '@angular/router';

export default [
    { path: '', redirectTo: 'uikit', pathMatch: 'full' },
    { path: 'uikit', loadChildren: () => import('../uikit/uikit.routes') },
    { path: 'documentation', loadComponent: () => import('../documentation/documentation').then(m => m.Documentation) },
    { path: 'pages', loadChildren: () => import('../pages.routes') }
] as Routes;
