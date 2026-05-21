import { TestBed } from '@angular/core/testing';
import { CachedUserService } from './cached-user.service';
import { CachedUser } from '@/app/core/models/user-record.model';

const STORAGE_KEY = 'specscore:cachedUser';

const fakeUser: CachedUser = {
  uid: 'u1',
  record: {
    display_name: 'Alice',
    email: 'alice@test.com',
    photo_url: 'https://img/alice.png',
    providers: [{ provider_id: 'github.com' }],
  },
};

describe('CachedUserService', () => {
  let service: CachedUserService;

  afterEach(() => localStorage.removeItem(STORAGE_KEY));

  function createService(): CachedUserService {
    TestBed.configureTestingModule({ providers: [CachedUserService] });
    return TestBed.inject(CachedUserService);
  }

  describe('init', () => {
    it('returns null when localStorage is empty', () => {
      service = createService();
      expect(service.cachedUser()).toBeNull();
    });

    it('reads existing cached user from localStorage', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fakeUser));
      service = createService();
      expect(service.cachedUser()).toEqual(fakeUser);
    });

    it('returns null when localStorage contains invalid JSON', () => {
      localStorage.setItem(STORAGE_KEY, '{broken');
      service = createService();
      expect(service.cachedUser()).toBeNull();
    });
  });

  describe('update', () => {
    it('writes to localStorage and updates the signal', () => {
      service = createService();
      service.update(fakeUser.uid, fakeUser.record);
      expect(service.cachedUser()).toEqual(fakeUser);
      const raw = localStorage.getItem(STORAGE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw ?? '')).toEqual(fakeUser);
    });
  });

  describe('clear', () => {
    it('removes from localStorage and nulls the signal', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fakeUser));
      service = createService();
      service.clear();
      expect(service.cachedUser()).toBeNull();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('validateUid', () => {
    it('keeps cache when uid matches', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fakeUser));
      service = createService();
      service.validateUid('u1');
      expect(service.cachedUser()).toEqual(fakeUser);
    });

    it('clears cache when uid does not match', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fakeUser));
      service = createService();
      service.validateUid('different-uid');
      expect(service.cachedUser()).toBeNull();
    });
  });
});
