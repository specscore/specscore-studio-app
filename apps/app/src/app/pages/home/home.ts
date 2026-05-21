import { Component, computed, inject } from '@angular/core';
import { AuthService } from '@/app/core/services/auth.service';
import { CachedUserService } from '@/app/core/services/cached-user.service';
import { SignInCard } from './sign-in-card';
import { UserAuthCard } from './user-auth-card';
import { ProjectsCard } from './projects-card';
import { RouterModule } from '@angular/router';

@Component({
    selector: 'app-home',
    standalone: true,
    imports: [RouterModule, SignInCard, UserAuthCard, ProjectsCard],
    template: `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
            <div class="card border-left-primary" style="border-left: 3px solid var(--primary-color)">
                @if (showAuthCard()) {
                    <app-user-auth-card />
                } @else {
                    <app-sign-in-card />
                }
            </div>

            <div class="card">
                <app-projects-card />
            </div>
        </div>
    `,
    styles: [`
        :host {
            display: block;
        }
        .card {
            background: var(--surface-card);
            border: 1px solid var(--surface-border);
            border-radius: var(--content-border-radius);
            height: 100%;
        }
    `]
})
export class Home {
    readonly authService = inject(AuthService);
    private readonly cachedUserService = inject(CachedUserService);

    readonly showAuthCard = computed(() => this.authService.isAuthenticated() || this.cachedUserService.cachedUser() !== null);
}
