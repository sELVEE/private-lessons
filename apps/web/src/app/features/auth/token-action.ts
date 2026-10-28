import { HttpClient } from '@angular/common/http';
import { inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/api-error';

/** Shared state for pages opened from an e-mail link carrying `?token=`. */
export class TokenAction<T = unknown> {
  private readonly http = inject(HttpClient);

  readonly state = signal<'idle' | 'busy' | 'done' | 'error'>('idle');
  readonly error = signal<string | null>(null);
  readonly result = signal<T | null>(null);

  async post(url: string, body: object): Promise<T | null> {
    this.state.set('busy');
    this.error.set(null);
    try {
      const res = await firstValueFrom(this.http.post<T>(url, body));
      this.result.set(res);
      this.state.set('done');
      return res;
    } catch (err) {
      this.error.set(toApiError(err).message);
      this.state.set('error');
      return null;
    }
  }
}
