import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = environment.apiBaseUrl;

    private authHeaders(token: string): HttpHeaders {
        return new HttpHeaders({ Authorization: `Bearer ${token}` });
    }

    // Sessions
    createSession(token: string, body: { project_id: string; interactive?: boolean }): Observable<any> {
        return this.http.post(`${this.baseUrl}/sessions`, body, { headers: this.authHeaders(token) });
    }

    listSessions(token: string): Observable<any> {
        return this.http.get(`${this.baseUrl}/sessions`, { headers: this.authHeaders(token) });
    }

    getSession(token: string, sessionId: string): Observable<any> {
        return this.http.get(`${this.baseUrl}/sessions/${sessionId}`, { headers: this.authHeaders(token) });
    }

    deleteSession(token: string, sessionId: string): Observable<any> {
        return this.http.delete(`${this.baseUrl}/sessions/${sessionId}`, { headers: this.authHeaders(token) });
    }

    // Messages
    sendMessage(token: string, sessionId: string, body: { content: string; meta?: Record<string, any> }): Observable<any> {
        return this.http.post(`${this.baseUrl}/sessions/${sessionId}/messages`, body, { headers: this.authHeaders(token) });
    }
}
