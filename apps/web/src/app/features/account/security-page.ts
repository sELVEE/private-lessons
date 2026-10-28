import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, input, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import type { MfaEnableResponse, MfaSetupResponse, SessionInfo } from '@pl/shared';
import { PASSWORD_MIN_LENGTH } from '@pl/shared';
import QRCode from 'qrcode';
import { firstValueFrom } from 'rxjs';
import { applyServerErrors, toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { StudentSettings } from './student-settings';

@Component({
  selector: 'pl-security-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    StudentSettings,
  ],
  templateUrl: './security-page.html',
  styleUrl: './security-page.scss',
})
export default class SecurityPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly store = inject(AuthStore);

  /** `?mfa=required` when an admin is sent here to enrol. */
  readonly mfa = input<string>();
  readonly me = this.store.me;
  readonly passwordMin = PASSWORD_MIN_LENGTH;

  readonly sessions = signal<SessionInfo[]>([]);
  readonly setup = signal<(MfaSetupResponse & { qr: string }) | null>(null);
  readonly backupCodes = signal<string[] | null>(null);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  readonly enableForm = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });
  readonly disableForm = this.fb.group({
    password: ['', Validators.required],
    code: ['', Validators.required],
  });
  readonly passwordForm = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]],
  });

  ngOnInit() {
    if (!this.me()?.mfaSetupRequired) void this.loadSessions();
  }

  async loadSessions() {
    this.sessions.set(await firstValueFrom(this.http.get<SessionInfo[]>('/api/account/sessions')));
  }

  startMfa() {
    return this.run(async () => {
      const res = await firstValueFrom(
        this.http.post<MfaSetupResponse>('/api/account/mfa/setup', {}),
      );
      this.setup.set({
        ...res,
        qr: await QRCode.toDataURL(res.otpauthUri, { margin: 1, width: 220 }),
      });
    });
  }

  enableMfa() {
    if (this.enableForm.invalid) return this.enableForm.markAllAsTouched();
    return this.run(async () => {
      const res = await firstValueFrom(
        this.http.post<MfaEnableResponse>('/api/account/mfa/enable', this.enableForm.getRawValue()),
      );
      this.backupCodes.set(res.backupCodes);
      this.setup.set(null);
      this.enableForm.reset();
      await this.store.refresh();
      await this.loadSessions();
    }, this.enableForm);
  }

  disableMfa() {
    if (this.disableForm.invalid) return this.disableForm.markAllAsTouched();
    return this.run(async () => {
      await firstValueFrom(
        this.http.post('/api/account/mfa/disable', this.disableForm.getRawValue()),
      );
      this.disableForm.reset();
      this.backupCodes.set(null);
      await this.store.refresh();
      this.message.set('Weryfikacja dwuetapowa wyłączona.');
    }, this.disableForm);
  }

  changePassword() {
    if (this.passwordForm.invalid) return this.passwordForm.markAllAsTouched();
    return this.run(async () => {
      await firstValueFrom(
        this.http.post('/api/account/password', this.passwordForm.getRawValue()),
      );
      this.passwordForm.reset();
      this.message.set('Hasło zmienione. Pozostałe urządzenia zostały wylogowane.');
      await this.loadSessions();
    }, this.passwordForm);
  }

  revoke(id: string) {
    return this.run(async () => {
      await firstValueFrom(this.http.delete(`/api/account/sessions/${id}`));
      await this.loadSessions();
    });
  }

  revokeAll() {
    return this.run(async () => {
      await firstValueFrom(this.http.post('/api/account/sessions/revoke-all', {}));
      this.store.clear();
    });
  }

  describeAgent(ua: string | null): string {
    if (!ua) return 'Nieznane urządzenie';
    const browser = /Edg\//.test(ua)
      ? 'Edge'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Przeglądarka';
    const os = /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : '';
    return os ? `${browser} · ${os}` : browser;
  }

  private async run(fn: () => Promise<void>, form?: Parameters<typeof applyServerErrors>[0]) {
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
    try {
      await fn();
    } catch (err) {
      this.error.set(form ? applyServerErrors(form, err) : toApiError(err).message);
    } finally {
      this.busy.set(false);
    }
  }
}
