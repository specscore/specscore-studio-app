import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DividerModule } from 'primeng/divider';
import { DEMO_PROJECTS, DemoProject } from '@/app/core/models/project.model';
import { AuthService } from '@/app/core/services/auth.service';
import { CachedUserService } from '@/app/core/services/cached-user.service';

@Component({
    selector: 'app-projects-card',
    standalone: true,
    imports: [CommonModule, RouterModule, ButtonModule, DividerModule],
    template: `
        <div class="flex flex-col gap-4 p-4">
            <div class="flex items-center justify-between">
                <span class="text-xl font-semibold">My Projects</span>
                @if (showUser()) {
                    <p-button label="Add" icon="pi pi-plus" size="small" severity="secondary" [text]="true" />
                }
            </div>
            @if (!showUser()) {
                <p class="text-muted-color m-0">
                    <a class="text-primary cursor-pointer" routerLink="/auth/login">Sign in</a> to see your personal projects.
                </p>
            } @else if (userProjects().length > 0) {
                <ul class="list-none p-0 m-0 flex flex-col gap-2">
                    @for (project of userProjects(); track project.id) {
                        <li>
                            <a
                                [routerLink]="['/project']"
                                [queryParams]="{ id: project.id }"
                                class="flex items-start gap-2 p-2 border-round hover:bg-emphasis cursor-pointer no-underline text-color"
                            >
                                <i class="pi pi-folder text-primary" style="line-height: 1.5rem"></i>
                                <span class="font-medium">{{ project.name }}</span>
                            </a>
                        </li>
                    }
                </ul>
            } @else {
                <p class="text-muted-color m-0">No projects yet.</p>
            }
            <p-divider />
            <span class="text-xl font-semibold">Demo Projects</span>
            <ul class="list-none p-0 m-0 flex flex-col gap-2">
                @for (project of demoProjects; track project.name) {
                    <li>
                        <a
                            [routerLink]="['/project']"
                            [queryParams]="{ id: project.githubId }"
                            class="flex items-start gap-2 p-2 border-round hover:bg-emphasis cursor-pointer no-underline text-color"
                        >
                            <i class="pi pi-folder text-primary" style="line-height: 1.5rem"></i>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center justify-between gap-2">
                                    <span class="font-medium">{{ project.name }}</span>
                                    <div class="flex items-center gap-1 shrink-0">
                                        <i class="pi pi-github text-xs text-muted-color"></i>
                                        <span class="text-xs text-muted-color">{{ repoPath(project) }}</span>
                                    </div>
                                </div>
                                <p class="text-muted-color text-sm m-0">{{ project.description }}</p>
                            </div>
                        </a>
                    </li>
                }
            </ul>
        </div>
    `,
})
export class ProjectsCard {
    private readonly authService = inject(AuthService);
    private readonly cachedUserService = inject(CachedUserService);

    readonly demoProjects: DemoProject[] = DEMO_PROJECTS;

    readonly showUser = computed(() => this.authService.isAuthenticated() || this.cachedUserService.cachedUser() !== null);

    readonly userProjects = computed(() => {
        const cached = this.cachedUserService.cachedUser();
        if (!cached?.record.projects) return [];
        return Object.entries(cached.record.projects).map(([id, p]) => ({
            id,
            name: p.name || id,
        }));
    });

    repoPath(project: DemoProject): string {
        const [repo, org] = project.githubId.split('@');
        return `${org}/${repo}`;
    }
}
