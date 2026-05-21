/**
 * Per-user project entry stored in `users/{uid}.projects` map.
 */
export interface UserProject {
    name?: string;
    created_at?: string;
}

/**
 * A public demo project available to all users.
 */
export interface DemoProject {
    id: string;
    name: string;
    description: string;
    githubId: string;
}

/** Public demo projects shown on the home page. */
export const DEMO_PROJECTS: DemoProject[] = [];
