import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { AppMenuitem } from './app.menuitem';
import { GitHubService } from '@/app/core/services/github.service';
import { LayoutService } from '@/app/layout/service/layout.service';
import { filter } from 'rxjs/operators';

@Component({
    selector: 'app-menu',
    standalone: true,
    imports: [CommonModule, AppMenuitem, RouterModule],
    template: `<ul class="layout-menu">
        @for (item of model(); track item.label) {
            @if (!item.separator) {
                <li app-menuitem [item]="item" [root]="true"></li>
            } @else {
                <li class="menu-separator"></li>
            }
        }
    </ul> `,
})
export class AppMenu implements OnInit {
    private readonly router = inject(Router);
    private readonly githubService = inject(GitHubService);
    private readonly layoutService = inject(LayoutService);

    readonly model = signal<MenuItem[]>([]);

    private specChildrenCache = new Map<string, MenuItem[]>();
    private loadingPaths = new Set<string>();
    private lastProjectId: string | null = null;

    ngOnInit() {
        this.updateMenu();
        this.router.events
            .pipe(filter(event => event instanceof NavigationEnd))
            .subscribe(() => this.updateMenu());
    }

    private updateMenu() {
        const url = this.router.url;
        if (url.startsWith('/project')) {
            this.model.set(this.buildProjectMenu(url));
        } else {
            this.model.set(this.buildDefaultMenu());
        }
    }

    private buildProjectMenu(url: string): MenuItem[] {
        const idParam = new URL(url, 'http://localhost').searchParams.get('id');
        const queryParams: Record<string, string> = idParam ? { id: idParam } : {};

        if (idParam !== this.lastProjectId) {
            this.lastProjectId = idParam;
            this.specChildrenCache.clear();
            this.loadingPaths.clear();
        }

        const specTypes = [
            { label: 'Architecture', icon: 'pi pi-fw pi-sitemap', route: '/project/architecture', dir: 'architecture' },
            { label: 'Features', icon: 'pi pi-fw pi-list', route: '/project/features', dir: 'features' },
            { label: 'Plans', icon: 'pi pi-fw pi-map', route: '/project/plans', dir: 'plans' },
            { label: 'Tests', icon: 'pi pi-fw pi-check-circle', route: '/project/tests', dir: 'tests' },
        ];

        const specItems: MenuItem[] = specTypes.map(spec => {
            const specPath = `spec/${spec.dir}`;
            const cached = this.specChildrenCache.get(specPath);
            const item: MenuItem & { path: string } = {
                label: spec.label,
                icon: spec.icon,
                routerLink: [spec.route],
                queryParams,
                path: `/spec-${spec.dir}`,
                command: () => this.loadChildren(specPath, spec.route, idParam, queryParams),
            };
            if (cached && cached.length > 0) {
                item.items = cached;
            }
            return item;
        });

        return [
            {
                label: 'Project',
                items: [
                    { label: 'Overview', icon: 'pi pi-fw pi-home', routerLink: ['/project'], queryParams },
                ],
            },
            {
                label: 'Specifications',
                items: specItems,
            },
        ];
    }

    private loadChildren(dirPath: string, parentRoute: string, projectId: string | null, queryParams: Record<string, string>) {
        if (this.specChildrenCache.has(dirPath) || this.loadingPaths.has(dirPath) || !projectId) return;

        const parsed = this.parseProjectId(projectId);
        if (!parsed) return;

        this.loadingPaths.add(dirPath);
        this.githubService.fetchDirectoryContents(parsed.owner, parsed.repo, dirPath).subscribe({
            next: (entries) => {
                this.loadingPaths.delete(dirPath);
                const children: MenuItem[] = entries.map(entry => {
                    const childItem: MenuItem & { path: string } = {
                        label: entry.name,
                        icon: 'pi pi-fw pi-folder',
                        routerLink: [parentRoute],
                        queryParams: { ...queryParams, path: entry.path },
                        path: `/spec-${entry.path}`,
                        command: () => this.loadChildren(entry.path, parentRoute, projectId, queryParams),
                    };
                    const childCached = this.specChildrenCache.get(entry.path);
                    if (childCached && childCached.length > 0) {
                        childItem.items = childCached;
                    }
                    return childItem;
                });
                this.specChildrenCache.set(dirPath, children);
                this.updateMenu();
                if (children.length > 0) {
                    const pathKey = `/spec-${dirPath}`;
                    this.layoutService.layoutState.update(val => ({
                        ...val,
                        activePath: pathKey,
                    }));
                }
            },
            error: () => {
                this.loadingPaths.delete(dirPath);
                this.specChildrenCache.set(dirPath, []);
            },
        });
    }

    private parseProjectId(id: string): { owner: string; repo: string } | null {
        const match = id.match(/^([^@]+)@([^@]+)@([^@]+)$/);
        if (!match) return null;
        return { owner: match[2], repo: match[1] };
    }

    private buildDefaultMenu(): MenuItem[] {
        return [
            {
                label: 'Home',
                items: [{ label: 'Home', icon: 'pi pi-fw pi-home', routerLink: ['/'] }]
            },
            {
                label: 'PrimeNG Demos',
                items: [
                    { label: 'Dashboard', icon: 'pi pi-fw pi-chart-pie', routerLink: ['/prime-demos'] },
                    { label: 'Form Layout', icon: 'pi pi-fw pi-id-card', routerLink: ['/prime-demos/uikit/formlayout'] },
                    { label: 'Input', icon: 'pi pi-fw pi-check-square', routerLink: ['/prime-demos/uikit/input'] },
                    { label: 'Button', icon: 'pi pi-fw pi-mobile', class: 'rotated-icon', routerLink: ['/prime-demos/uikit/button'] },
                    { label: 'Table', icon: 'pi pi-fw pi-table', routerLink: ['/prime-demos/uikit/table'] },
                    { label: 'List', icon: 'pi pi-fw pi-list', routerLink: ['/prime-demos/uikit/list'] },
                    { label: 'Tree', icon: 'pi pi-fw pi-share-alt', routerLink: ['/prime-demos/uikit/tree'] },
                    { label: 'Panel', icon: 'pi pi-fw pi-tablet', routerLink: ['/prime-demos/uikit/panel'] },
                    { label: 'Overlay', icon: 'pi pi-fw pi-clone', routerLink: ['/prime-demos/uikit/overlay'] },
                    { label: 'Media', icon: 'pi pi-fw pi-image', routerLink: ['/prime-demos/uikit/media'] },
                    { label: 'Menu', icon: 'pi pi-fw pi-bars', routerLink: ['/prime-demos/uikit/menu'] },
                    { label: 'Message', icon: 'pi pi-fw pi-comment', routerLink: ['/prime-demos/uikit/message'] },
                    { label: 'File', icon: 'pi pi-fw pi-file', routerLink: ['/prime-demos/uikit/file'] },
                    { label: 'Chart', icon: 'pi pi-fw pi-chart-bar', routerLink: ['/prime-demos/uikit/charts'] },
                    { label: 'Timeline', icon: 'pi pi-fw pi-calendar', routerLink: ['/prime-demos/uikit/timeline'] },
                    { label: 'Misc', icon: 'pi pi-fw pi-circle', routerLink: ['/prime-demos/uikit/misc'] }
                ]
            }
        ];
    }
}
