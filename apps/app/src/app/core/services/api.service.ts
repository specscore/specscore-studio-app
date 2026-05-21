import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@/environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly http = inject(HttpClient);
    private readonly apiUrl = environment.apiBaseUrl;

    syncUser(params: { display_name: string; email: string; photo_url: string; providers: string[] }): Observable<{ status: string }> {
        return this.http.post<{ status: string }>(`${this.apiUrl}/users/sync`, params);
    }
}
