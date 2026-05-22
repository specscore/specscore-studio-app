import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { AppMenuitem } from './app.menuitem';
import { GitHubService } from '@/app/core/services/github.service';
import { LayoutService } from '@/app/layout/service/layout.service';
import {
    PathCoordinates,
    UrlSchemeCoordinatesService,
} from '@/app/core/routing/url-scheme.guard';
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
    private readonly urlScheme = inject(UrlSchemeCoordinatesService);

    readonly model = signal<MenuItem[]>([]);

    private specChildrenCache = new Map<string, MenuItem[]>();
    private loadingPaths = new Set<string>();
    private lastProjectKey: string | null = null;

    ngOnInit() {
        this.updateMenu();
        this.router.events
            .pipe(filter(event => event instanceof NavigationEnd))
            .subscribe(() => this.updateMenu());
    }

    /**
     * Decide menu type by the current URL's first segment per the D-0001
     * dispatch rule:
     *   - segment contains "." → forge canonical → project menu
     *   - segment starts with "~" → handle canonical → project menu
     *     (handle placeholder for now, but the menu surface still applies)
     *   - otherwise (landing, auth, settings, …) → default menu
     *
     * When the URL is a project URL but coords aren't populated yet
     * (e.g. the guard hasn't run for this navigation), fall back to default
     * to avoid rendering an empty project menu.
     */
    private updateMenu() {
        const url = this.router.url;
        const firstSeg = (url.split('/')[1] ?? '').split('?')[0].split('#')[0];
        const isProjectUrl = firstSeg.includes('.') || firstSeg.startsWith('~');

        if (isProjectUrl) {
            const coords = this.urlScheme.coordinates();
            if (coords?.kind === 'path') {
                this.model.set(this.buildProjectMenu(coords));
                return;
            }
        }
        this.model.set(this.buildDefaultMenu());
    }

    private buildProjectMenu(coords: PathCoordinates): MenuItem[] {
        const projectRoot = `/${coords.git_host}/${coords.org}/${coords.repo}`;
        const projectKey = projectRoot;

        if (projectKey !== this.lastProjectKey) {
            this.lastProjectKey = projectKey;
            this.specChildrenCache.clear();
            this.loadingPaths.clear();
        }

        const specTypes = [
            { label: 'Architecture', icon: 'pi pi-fw pi-sitemap', dir: 'architecture' },
            { label: 'Features', icon: 'pi pi-fw pi-list', dir: 'features' },
            { label: 'Plans', icon: 'pi pi-fw pi-map', dir: 'plans' },
            { label: 'Tests', icon: 'pi pi-fw pi-check-circle', dir: 'tests' },
        ];

        const specItems: MenuItem[] = specTypes.map(spec => {
            const specPath = `spec/${spec.dir}`;
            const routerLink = `${projectRoot}/${specPath}`;
            const cached = this.specChildrenCache.get(specPath);
            const item: MenuItem & { path: string } = {
                label: spec.label,
                icon: spec.icon,
                // Canonical URL with #page= view-selector hash per REQ:page-view-hash.
                // Navigating here loads the directory's README in ProjectPage; the
                // #page= hash highlights which spec view is active in the left nav.
                routerLink: [routerLink],
                fragment: `page=${spec.dir}`,
                path: `/spec-${spec.dir}`,
                command: () => this.loadChildren(specPath, projectRoot, coords, spec.dir),
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
                    { label: 'Overview', icon: 'pi pi-fw pi-home', routerLink: [projectRoot] },
                ],
            },
            {
                label: 'Specifications',
                items: specItems,
            },
        ];
    }

    /**
     * On-demand load child directories under a spec root (e.g. each feature
     * under spec/features/). Used to populate the menu's expandable tree
     * when a top-level spec category is opened. Sub-items link to the
     * canonical URL for that nested directory and carry the same
     * #page=<spec-category> hash for left-nav highlight consistency.
     */
    private loadChildren(dirPath: string, projectRoot: string, coords: PathCoordinates, pageHash: string) {
        if (this.specChildrenCache.has(dirPath) || this.loadingPaths.has(dirPath)) return;

        this.loadingPaths.add(dirPath);
        this.githubService.fetchDirectoryContents(coords.org, coords.repo, dirPath).subscribe({
            next: (entries) => {
                this.loadingPaths.delete(dirPath);
                const children: MenuItem[] = entries.map(entry => {
                    const routerLink = `${projectRoot}/${entry.path}`;
                    const childItem: MenuItem & { path: string } = {
                        label: entry.name,
                        icon: 'pi pi-fw pi-folder',
                        routerLink: [routerLink],
                        fragment: `page=${pageHash}`,
                        path: `/spec-${entry.path}`,
                        command: () => this.loadChildren(entry.path, projectRoot, coords, pageHash),
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
