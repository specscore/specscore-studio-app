import { Component, inject } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '@/app/core/services/auth.service';

@Component({
    selector: 'app-sign-in-card',
    standalone: true,
    imports: [ButtonModule],
    template: `
        <div class="flex flex-col gap-4 p-4">
            <div class="flex items-center gap-2">
                <i class="pi pi-github text-2xl"></i>
                <span class="text-xl font-semibold">Sign in with GitHub</span>
            </div>
            <p class="text-muted-color m-0">Access your projects, claim tasks, and manage your workspace.</p>
            <p-button label="Continue with GitHub" icon="pi pi-github" severity="contrast" class="w-full" styleClass="w-full" (onClick)="signInWithGitHub()" />
        </div>
    `,
})
export class SignInCard {
    private readonly authService = inject(AuthService);

    async signInWithGitHub() {
        // No navigation needed: the home page reactively switches from
        // sign-in-card to user-auth-card once authService.user() updates.
        await this.authService.signInWithGitHub();
    }
}
