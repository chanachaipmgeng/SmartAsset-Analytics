import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, firstValueFrom, map, shareReplay } from 'rxjs';
import { TokenResponse, User } from './models';

interface Session {
  accessToken: string;
  refreshToken: string;
  user: User;
}

const STORAGE_KEY = 'inventory.session';

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly session = signal<Session | null>(readSession());
  private refreshInFlight: Observable<string> | null = null;

  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly isSuperadmin = computed(() => this.user()?.role === 'superadmin');
  readonly isAdmin = computed(() =>
    ['superadmin', 'tenant_admin'].includes(this.user()?.role ?? ''),
  );
  readonly canWrite = computed(() => this.user() !== null && this.user()!.role !== 'viewer');

  accessToken(): string | null {
    return this.session()?.accessToken ?? null;
  }

  hasRefreshToken(): boolean {
    return !!this.session()?.refreshToken;
  }

  async login(email: string, password: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<TokenResponse>('/api/v1/auth/login', { email, password }),
    );
    this.store(res);
  }

  /** Concurrent 401s share one refresh request. */
  refresh(): Observable<string> {
    if (!this.refreshInFlight) {
      const refreshToken = this.session()?.refreshToken;
      this.refreshInFlight = this.http
        .post<TokenResponse>('/api/v1/auth/refresh', { refresh_token: refreshToken })
        .pipe(
          map((res) => {
            this.store(res);
            return res.access_token;
          }),
          finalize(() => (this.refreshInFlight = null)),
          shareReplay(1),
        );
    }
    return this.refreshInFlight;
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.session.set(null);
    this.router.navigateByUrl('/login');
  }

  private store(res: TokenResponse): void {
    const session: Session = {
      accessToken: res.access_token,
      refreshToken: res.refresh_token,
      user: res.user,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    this.session.set(session);
  }
}
