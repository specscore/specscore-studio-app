import { UserProject } from './project.model';

/**
 * Mirrors the Firestore AuthProvider embedded in users/{uid}.providers.
 */
export interface UserAuthProvider {
  provider_id: string;
  linked_at?: string;
}

/**
 * Mirrors the Firestore `users/{uid}` document.
 */
export interface UserRecord {
  display_name?: string;
  email?: string;
  photo_url?: string;
  providers?: UserAuthProvider[];
  projects?: Record<string, UserProject>;
}

/**
 * Shape stored in localStorage under `specscore:cachedUser`.
 * `uid` is kept separate from `record` to separate identity from data.
 */
export interface CachedUser {
  uid: string;
  record: UserRecord;
}
