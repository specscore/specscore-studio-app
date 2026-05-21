import { Routes } from '@angular/router';
import { ProjectSpecPage } from './project-spec-page';

export default [
  {
    path: '',
    loadComponent: () => import('./project-page').then(m => m.ProjectPage),
  },
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
] as Routes;
