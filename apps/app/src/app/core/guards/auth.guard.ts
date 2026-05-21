import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, race, take, timer } from 'rxjs';
import { AuthService } from '@/app/core/services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return race(
    authService.user$.pipe(take(1)),
    timer(5000).pipe(map(() => null)),
  ).pipe(
    map((user) => {
      if (user) {
        return true;
      }
      return router.createUrlTree(['/auth/login'], {
        queryParams: { returnUrl: state.url },
      });
    })
  );
};
