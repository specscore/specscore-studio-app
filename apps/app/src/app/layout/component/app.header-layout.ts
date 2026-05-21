import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AppTopbar } from './app.topbar';
import { AppFooter } from './app.footer';

@Component({
    selector: 'app-header-layout',
    standalone: true,
    imports: [AppTopbar, RouterModule, AppFooter],
    template: `
        <div class="layout-wrapper">
            <app-topbar />
            <div class="layout-main-container" style="margin-left: 0">
                <div class="layout-main">
                    <router-outlet />
                </div>
                <app-footer />
            </div>
        </div>
    `
})
export class AppHeaderLayout {}
