import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { FIRESTORE, FIRESTORE_OPS } from '@/app/core/firebase/firebase.providers';
import { UserProject } from '@/app/core/models/project.model';

/**
 * Reads and writes the per-user projects map stored at `users/{uid}.projects`.
 * Mirrors `HostService` for `users/{uid}.hosts`.
 */
@Injectable({ providedIn: 'root' })
export class ProjectStoreService {
    private readonly firestore = inject(FIRESTORE);
    private readonly ops = inject(FIRESTORE_OPS);

    /**
     * Real-time subscription to the user's projects map from their user doc.
     */
    watchUserProjects(uid: string): Observable<Record<string, UserProject>> {
        return new Observable((subscriber) => {
            const userDoc = this.ops.doc(this.firestore, 'users', uid);
            const unsubscribe = this.ops.onSnapshot(
                userDoc,
                (snapshot) => {
                    const data = snapshot.data();
                    const projects: Record<string, UserProject> =
                        (data?.['projects'] as Record<string, UserProject> | undefined) ?? {};
                    subscriber.next(projects);
                },
                (error) => subscriber.error(error),
            );
            return () => unsubscribe();
        });
    }

    /**
     * Saves a project entry to the user's projects map. Uses set with merge
     * so other projects (and other user fields) are preserved.
     */
    async saveUserProject(uid: string, projectId: string, name?: string): Promise<void> {
        const userDoc = this.ops.doc(this.firestore, 'users', uid);
        const entry: UserProject = { created_at: new Date().toISOString() };
        if (name) {
            entry.name = name;
        }
        await this.ops.setDoc(userDoc, { projects: { [projectId]: entry } }, { merge: true });
    }
}
