import { InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import {
    doc,
    DocumentData,
    DocumentReference,
    Firestore,
    getFirestore,
    onSnapshot,
    setDoc,
    SetOptions,
    Unsubscribe,
} from 'firebase/firestore';

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FirebaseApp');
export const FIREBASE_AUTH = new InjectionToken<Auth>('FirebaseAuth');
export const FIRESTORE = new InjectionToken<Firestore>('Firestore');

/**
 * Thin facade over the firebase/firestore free functions used by the app.
 * Exposed as an injection token so tests can replace it with a fake without
 * having to intercept ESM module imports.
 */
export interface FirestoreOps {
    doc(firestore: Firestore, path: string, ...segments: string[]): DocumentReference<DocumentData>;
    onSnapshot(
        reference: DocumentReference<DocumentData>,
        next: (snapshot: { data: () => DocumentData | undefined }) => void,
        error?: (error: Error) => void,
    ): Unsubscribe;
    setDoc(
        reference: DocumentReference<DocumentData>,
        data: DocumentData,
        options?: SetOptions,
    ): Promise<void>;
}

export const FIRESTORE_OPS = new InjectionToken<FirestoreOps>('FirestoreOps', {
    providedIn: 'root',
    factory: () => ({
        doc: (firestore, path, ...segments) => doc(firestore, path, ...segments),
        onSnapshot: (reference, next, error) => onSnapshot(reference, next, error),
        setDoc: (reference, data, options) =>
            options ? setDoc(reference, data, options) : setDoc(reference, data),
    }),
});

export function provideFirebase(config: Record<string, string>) {
    return makeEnvironmentProviders([
        {
            provide: FIREBASE_APP,
            useFactory: () => initializeApp(config)
        },
        {
            provide: FIREBASE_AUTH,
            useFactory: (app: FirebaseApp) => getAuth(app),
            deps: [FIREBASE_APP]
        },
        {
            provide: FIRESTORE,
            useFactory: (app: FirebaseApp) => getFirestore(app),
            deps: [FIREBASE_APP]
        }
    ]);
}
