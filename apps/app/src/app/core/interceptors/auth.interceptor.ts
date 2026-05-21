import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { FIREBASE_AUTH } from '../firebase/firebase.providers';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const auth = inject(FIREBASE_AUTH);
    const user = auth.currentUser;

    if (!user) {
        return next(req);
    }

    return from(user.getIdToken()).pipe(
        switchMap((token) => {
            const cloned = req.clone({
                setHeaders: { Authorization: `Bearer ${token}` }
            });
            return next(cloned);
        })
    );
};
