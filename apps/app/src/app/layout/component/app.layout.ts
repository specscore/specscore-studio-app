import { Component, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AppTopbar } from './app.topbar';
import { AppSidebar } from './app.sidebar';
import { AppFooter } from './app.footer';
import { AppProjectBreadcrumbs } from './app.project-breadcrumbs';
import { LayoutService } from '@/app/layout/service/layout.service';
import { UrlSchemeCoordinatesService } from '@/app/core/routing/url-scheme.guard';

@Component({
    selector: 'app-layout',
    standalone: true,
    imports: [CommonModule, AppTopbar, AppSidebar, RouterModule, AppFooter, AppProjectBreadcrumbs],
    template: `<div class="layout-wrapper" [ngClass]="containerClass()">
        <app-topbar></app-topbar>
        <app-project-breadcrumbs></app-project-breadcrumbs>
        <app-sidebar></app-sidebar>
        <div class="layout-main-container">
            <div class="layout-main">
                <router-outlet></router-outlet>
            </div>
            <app-footer></app-footer>
        </div>
        <div class="layout-mask"></div>
    </div> `
})
export class AppLayout {
    layoutService = inject(LayoutService);
    private readonly urlScheme = inject(UrlSchemeCoordinatesService);

    constructor() {
        effect(() => {
            const state = this.layoutService.layoutState();
            if (state.mobileMenuActive) {
                document.body.classList.add('blocked-scroll');
            } else {
                document.body.classList.remove('blocked-scroll');
            }
        });
    }

    containerClass = computed(() => {
        const config = this.layoutService.layoutConfig();
        const state = this.layoutService.layoutState();
        // breadcrumbs-visible offsets sidebar + main-container down so the
        // fixed-position project breadcrumb strip slots between the topbar
        // and the rest of the layout. Driven from coords because the
        // breadcrumb component itself self-hides on non-project URLs.
        const hasProjectBreadcrumbs = this.urlScheme.coordinates()?.kind === 'path';
        return {
            'layout-overlay': config.menuMode === 'overlay',
            'layout-static': config.menuMode === 'static',
            'layout-static-inactive': state.staticMenuDesktopInactive && config.menuMode === 'static',
            'layout-overlay-active': state.overlayMenuActive,
            'layout-mobile-active': state.mobileMenuActive,
            'layout-breadcrumbs-visible': hasProjectBreadcrumbs,
        };
    })
}
