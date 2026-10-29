import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { AccountType, LoginInput, LoginResponse, MeResponse } from '@pl/shared';
import { firstValueFrom } from 'rxjs';

/** Holds the logged-in user. The session itself lives in an HttpOnly cookie the app never sees. */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _me = signal<MeResponse | null>(null);
  private loaded: Promise<void> | null = null;

  readonly me = this._me.asReadonly();
  readonly isLoggedIn = computed(() => this._me() !== null);
  readonly role = computed<AccountType | 'admin' | null>(() => {
    const me = this._me();
    if (!me) return null;
    return me.isPlatformAdmin ? 'admin' : me.accountType;
  });

  /** Loads the current user once per app start (also obtains the CSRF cookie). */
  ensureLoaded(): Promise<void> {
    this.loaded ??= firstValueFrom(this.http.get<MeResponse>('/api/auth/me'))
      .then((me) => this._me.set(me))
      .catch(() => this._me.set(null));
    return this.loaded;
  }

  async refresh(): Promise<void> {
    this.loaded = null;
    await this.ensureLoaded();
  }

  async login(input: LoginInput): Promise<LoginResponse> {
    const res = await firstValueFrom(this.http.post<LoginResponse>('/api/auth/login', input));
    if (res.status === 'ok') this.setUser(res.user);
    return res;
  }

  async loginMfa(challengeId: string, code: string): Promise<void> {
    const res = await firstValueFrom(
      this.http.post<LoginResponse>('/api/auth/login/mfa', { challengeId, code }),
    );
    if (res.status === 'ok') this.setUser(res.user);
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } finally {
      this.clear();
    }
  }

  /** Called when the server says the session is gone. */
  clear(redirect = true): void {
    this._me.set(null);
    clearOfflineData();
    this.loaded = Promise.resolve();
    if (redirect) void this.router.navigate(['/login']);
  }

  private setUser(me: MeResponse) {
    this._me.set(me);
    this.loaded = Promise.resolve();
  }
}

/**
 * The service worker keeps the lesson plan for offline use. On logout it must go, so the next
 * person on a shared device does not see it.
 */
function clearOfflineData(): void {
  if (typeof caches === 'undefined') return;
  void caches
    .keys()
    .then((keys) =>
      Promise.all(keys.filter((k) => k.includes(':data:')).map((k) => caches.delete(k))),
    )
    .catch(() => undefined);
}
