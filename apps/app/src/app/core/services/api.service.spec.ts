import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { ApiService } from './api.service';
import { environment } from '@/environments/environment';

describe('ApiService', () => {
    let svc: ApiService;
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [ApiService],
        });
        svc = TestBed.inject(ApiService);
        http = TestBed.inject(HttpTestingController);
    });

    it('syncUser posts user fields to /users/sync', () => {
        svc.syncUser({
            display_name: 'Ada',
            email: 'ada@example.com',
            photo_url: 'https://example.com/p.png',
            providers: ['github.com'],
        }).subscribe();
        const req = http.expectOne(`${environment.apiBaseUrl}/users/sync`);
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({
            display_name: 'Ada',
            email: 'ada@example.com',
            photo_url: 'https://example.com/p.png',
            providers: ['github.com'],
        });
    });
});
