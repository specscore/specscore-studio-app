import { Injectable, signal } from '@angular/core';
import { CachedUser, UserRecord } from '@/app/core/models/user-record.model';

const STORAGE_KEY = 'specscore:cachedUser';

@Injectable({ providedIn: 'root' })
export class CachedUserService {
  readonly cachedUser = signal<CachedUser | null>(this.load());

  update(uid: string, record: UserRecord): void {
    const entry: CachedUser = { uid, record };
    this.cachedUser.set(entry);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    } catch {
      // localStorage full or disabled — signal still works for this session
    }
  }

  clear(): void {
    this.cachedUser.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  validateUid(uid: string): void {
    const cached = this.cachedUser();
    if (cached && cached.uid !== uid) {
      this.clear();
    }
  }

  private load(): CachedUser | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as CachedUser;
    } catch {
      return null;
    }
  }
}
