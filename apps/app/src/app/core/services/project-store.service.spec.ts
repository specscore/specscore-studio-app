import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { ProjectStoreService } from './project-store.service';
import { FIRESTORE, FIRESTORE_OPS, FirestoreOps } from '@/app/core/firebase/firebase.providers';

describe('ProjectStoreService', () => {
    let service: ProjectStoreService;
    const fakeFirestore = {} as unknown;
    let ops: {
        doc: ReturnType<typeof vi.fn>;
        onSnapshot: ReturnType<typeof vi.fn>;
        setDoc: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        ops = {
            doc: vi.fn((_db: unknown, ...path: string[]) => ({ __path: path.join('/') })),
            onSnapshot: vi.fn(),
            setDoc: vi.fn().mockResolvedValue(undefined),
        };
        TestBed.configureTestingModule({
            providers: [
                ProjectStoreService,
                { provide: FIRESTORE, useValue: fakeFirestore },
                { provide: FIRESTORE_OPS, useValue: ops as unknown as FirestoreOps },
            ],
        });
        service = TestBed.inject(ProjectStoreService);
    });

    describe('watchUserProjects', () => {
        it('emits the projects map from a Firestore snapshot', async () => {
            ops.onSnapshot.mockImplementation(
                (_ref: unknown, next: (snap: unknown) => void) => {
                    next({ data: () => ({ projects: { p1: { name: 'P1' } } }) });
                    return () => undefined;
                },
            );
            const result = await firstValueFrom(service.watchUserProjects('u1'));
            expect(ops.doc).toHaveBeenCalledWith(fakeFirestore, 'users', 'u1');
            expect(result).toEqual({ p1: { name: 'P1' } });
        });

        it('emits an empty object when the user doc has no projects field', async () => {
            ops.onSnapshot.mockImplementation(
                (_ref: unknown, next: (snap: unknown) => void) => {
                    next({ data: () => ({}) });
                    return () => undefined;
                },
            );
            const result = await firstValueFrom(service.watchUserProjects('u1'));
            expect(result).toEqual({});
        });

        it('emits an empty object when the snapshot has no data', async () => {
            ops.onSnapshot.mockImplementation(
                (_ref: unknown, next: (snap: unknown) => void) => {
                    next({ data: () => undefined });
                    return () => undefined;
                },
            );
            const result = await firstValueFrom(service.watchUserProjects('u1'));
            expect(result).toEqual({});
        });

        it('forwards Firestore snapshot errors to the observer', async () => {
            ops.onSnapshot.mockImplementation(
                (_ref: unknown, _next: unknown, error: (e: unknown) => void) => {
                    error(new Error('boom'));
                    return () => undefined;
                },
            );
            await expect(firstValueFrom(service.watchUserProjects('u1'))).rejects.toThrow('boom');
        });

        it('calls the unsubscribe function when the subscription tears down', () => {
            const unsubscribe = vi.fn();
            ops.onSnapshot.mockReturnValue(unsubscribe);
            const sub = service.watchUserProjects('u1').subscribe();
            sub.unsubscribe();
            expect(unsubscribe).toHaveBeenCalled();
        });
    });

    describe('saveUserProject', () => {
        it('writes to users/{uid} with merged projects map and a name', async () => {
            await service.saveUserProject('u1', 'p1', 'Proj 1');
            expect(ops.doc).toHaveBeenCalledWith(fakeFirestore, 'users', 'u1');
            const call = ops.setDoc.mock.calls[0];
            expect(call[1]).toEqual({
                projects: {
                    p1: expect.objectContaining({ name: 'Proj 1', created_at: expect.any(String) }),
                },
            });
            expect(call[2]).toEqual({ merge: true });
        });

        it('omits the name field when not provided', async () => {
            await service.saveUserProject('u1', 'p1');
            const call = ops.setDoc.mock.calls[0];
            const entry = call[1].projects.p1;
            expect(entry.name).toBeUndefined();
            expect(entry.created_at).toEqual(expect.any(String));
        });
    });
});
