import { Component, computed, inject, input, signal, OnInit, AfterViewInit } from '@angular/core';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RippleModule } from 'primeng/ripple';
import { LayoutService } from '@/app/layout/service/layout.service';
import { filter } from 'rxjs/operators';

@Component({
    selector: '[app-menuitem]',
    imports: [CommonModule, RouterModule, RippleModule],
    template: `
        @if (root() && isVisible()) {
            <div class="layout-menuitem-root-text">{{ item().label }}</div>
        }
        @if ((!hasRouterLink() || hasChildren()) && isVisible()) {
            <a [attr.href]="item().url" (click)="itemClick($event)" [ngClass]="item().class" [attr.target]="item().target" tabindex="0" pRipple>
                <i [ngClass]="item().icon" class="layout-menuitem-icon"></i>
                <span class="layout-menuitem-text">{{ item().label }}</span>
                @if (item().badge) {
                    <span class="layout-menuitem-badge">{{ item().badge }}</span>
                }
                @if (hasChildren()) {
                    <!-- Chevron handles expand/collapse independently of the
                         text click. Text click navigates + ensures expanded;
                         the chevron toggles between expanded and collapsed
                         without navigating. -->
                    <i class="pi pi-fw pi-angle-down layout-submenu-toggler"
                       (click)="toggleClick($event)"
                       role="button"
                       [attr.aria-label]="isActive() ? 'Collapse ' + item().label : 'Expand ' + item().label"
                       [attr.aria-expanded]="isActive()"></i>
                }
            </a>
        }
        @if (hasRouterLink() && !hasChildren() && isVisible()) {
            <a
                (click)="itemClick($event)"
                [ngClass]="item().class"
                [routerLink]="item().routerLink"
                routerLinkActive="active-route"
                [routerLinkActiveOptions]="item().routerLinkActiveOptions || { paths: 'exact', queryParams: 'ignored', matrixParams: 'ignored', fragment: 'ignored' }"
                [fragment]="item().fragment"
                [queryParamsHandling]="item().queryParamsHandling"
                [preserveFragment]="item().preserveFragment"
                [skipLocationChange]="item().skipLocationChange"
                [replaceUrl]="item().replaceUrl"
                [state]="item().state"
                [queryParams]="item().queryParams"
                [attr.target]="item().target"
                tabindex="0"
                pRipple
            >
                <i [ngClass]="item().icon" class="layout-menuitem-icon"></i>
                <span class="layout-menuitem-text">{{ item().label }}</span>
                @if (item().badge) {
                    <span class="layout-menuitem-badge">{{ item().badge }}</span>
                }
                @if (hasChildren()) {
                    <i class="pi pi-fw pi-angle-down layout-submenu-toggler"></i>
                }
            </a>
        }
        @if (hasChildren() && isVisible() && (root() || isActive())) {
            <ul [animate.enter]="initialized() ? 'p-submenu-enter' : null" [animate.leave]="'p-submenu-leave'" [class.layout-root-submenulist]="root()">
                @for (child of item().items; track child?.label) {
                    <li app-menuitem [item]="child" [parentPath]="fullPath()" [root]="false" [class]="child['badgeClass']"></li>
                }
            </ul>
        }
    `,
    host: {
        '[class.active-menuitem]': 'isActive()',
        '[class.layout-root-menuitem]': 'root()'
    },
    styles: [
        `
            .p-submenu-enter {
                animation: p-animate-submenu-expand 450ms cubic-bezier(0.86, 0, 0.07, 1) forwards;
            }

            .p-submenu-leave {
                animation: p-animate-submenu-collapse 450ms cubic-bezier(0.86, 0, 0.07, 1) forwards;
            }

            @keyframes p-animate-submenu-expand {
                from {
                    max-height: 0;
                    overflow: hidden;
                }
                to {
                    max-height: 1000px;
                    overflow: visible;
                }
            }

            @keyframes p-animate-submenu-collapse {
                from {
                    max-height: 1000px;
                    overflow: hidden;
                }
                to {
                    max-height: 0;
                    overflow: hidden;
                }
            }
        `,
        `
            .layout-menuitem-badge {
                margin-left: auto;
                font-size: 0.65rem;
                padding: 0.1rem 0.35rem;
                border-radius: var(--content-border-radius);
                background: var(--surface-200);
                color: var(--text-color-secondary);
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.02em;
            }
        `
    ]
})
export class AppMenuitem implements OnInit, AfterViewInit {
    layoutService = inject(LayoutService);

    router = inject(Router);

    item = input<any>(null);

    root = input<boolean>(false);

    parentPath = input<string | null>(null);

    isVisible = computed(() => this.item()?.visible !== false);

    hasChildren = computed(() => this.item()?.items && this.item()?.items.length > 0);

    hasRouterLink = computed(() => !!this.item()?.routerLink);

    fullPath = computed(() => {
        const itemPath = this.item()?.path;
        if (!itemPath) return this.parentPath();
        const parent = this.parentPath();
        if (parent && !itemPath.startsWith(parent)) {
            return parent + itemPath;
        }
        return itemPath;
    });

    isActive = computed(() => {
        const activePath = this.layoutService.layoutState().activePath;
        if (this.item()?.path) {
            return activePath?.startsWith(this.fullPath() ?? '') ?? false;
        }
        return false;
    });

    initialized = signal<boolean>(false);

    constructor() {
        this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
            if (this.item()?.routerLink) {
                this.updateActiveStateFromRoute();
            }
        });
    }

    ngOnInit() {
        if (this.item()?.routerLink) {
            this.updateActiveStateFromRoute();
        }
    }

    ngAfterViewInit() {
        setTimeout(() => {
            this.initialized.set(true);
        });
    }

    updateActiveStateFromRoute() {
        const item = this.item();
        if (!item?.routerLink) return;

        const isRouteActive = this.router.isActive(item.routerLink[0], {
            paths: 'exact',
            queryParams: 'ignored',
            matrixParams: 'ignored',
            fragment: 'ignored'
        });

        if (isRouteActive) {
            const parentPath = this.parentPath();
            if (parentPath) {
                // Non-contracting: if the current activePath is already a
                // descendant of (or equal to) parentPath, keep it. Without
                // this guard, navigating from .../cli/idea/new to .../cli
                // would fire this on the cli item and collapse the entire
                // idea sub-tree by setting activePath = Features.fullPath.
                const current = this.layoutService.layoutState().activePath;
                if (current && current.startsWith(parentPath)) return;
                this.layoutService.layoutState.update((val) => ({
                    ...val,
                    activePath: parentPath
                }));
            }
        }
    }

    itemClick(event: Event) {
        const item = this.item();

        if (item?.disabled) {
            event.preventDefault();
            return;
        }

        if (item?.command) {
            item.command({ originalEvent: event, item: item });
        }

        if (this.hasChildren()) {
            // Text click ALWAYS expands, NEVER collapses. Non-contracting:
            // if the current activePath is already a descendant of this
            // node, keep it (descendants stay expanded). Otherwise set to
            // this node's fullPath (which expands this node and any
            // ancestors). The chevron (toggleClick) is the only way to
            // deliberately collapse.
            const fullPath = this.fullPath() ?? '';
            const current = this.layoutService.layoutState().activePath;
            if (current && current.startsWith(fullPath)) {
                this.layoutService.layoutState.update((val) => ({ ...val, menuHoverActive: true }));
            } else {
                this.layoutService.layoutState.update((val) => ({
                    ...val,
                    activePath: fullPath,
                    menuHoverActive: true
                }));
            }
        } else {
            this.layoutService.layoutState.update((val) => ({
                ...val,
                overlayMenuActive: false,
                staticMenuMobileActive: false,
                mobileMenuActive: false,
                menuHoverActive: false
            }));
        }
    }

    /**
     * Chevron click — toggles expand/collapse without navigating. Stops
     * propagation so the surrounding <a>'s itemClick handler (which
     * navigates and forces-expanded) doesn't also fire.
     */
    toggleClick(event: Event) {
        event.preventDefault();
        event.stopPropagation();
        if (!this.hasChildren()) return;
        if (this.isActive()) {
            this.layoutService.layoutState.update((val) => ({
                ...val,
                activePath: this.parentPath()
            }));
        } else {
            this.layoutService.layoutState.update((val) => ({
                ...val,
                activePath: this.fullPath(),
                menuHoverActive: true
            }));
        }
    }
}
