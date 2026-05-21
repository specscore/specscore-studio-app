import { Routes } from '@angular/router';
import { AppLayout } from './layout/component/app.layout';
import { AppHeaderLayout } from './layout/component/app.header-layout';

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
            {
                path: 'project',
                loadChildren: () => import('./pages/project/project.routes')
            }
        ]
    },
    { path: 'landing', loadComponent: () => import('./pages/landing/landing').then(m => m.Landing) },
    { path: 'auth', loadChildren: () => import('./pages/auth/auth.routes') },
    { path: '**', loadComponent: () => import('./pages/notfound/notfound').then(m => m.Notfound) }
];
