import { HttpClient } from '@angular/common/http';
import { Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';

/** Welcome screen and login. Second step asks for the MFA code when enabled. */
@Component({
  selector: 'pl-login-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export default class LoginPage {
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly returnUrl = input<string>();

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly unverified = signal(false);
  readonly challengeId = signal<string | null>(null);
  readonly hidePassword = signal(true);

  readonly form = this.fb.group({
    identifier: ['', [Validators.required, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });
  readonly mfaForm = this.fb.group({ code: ['', [Validators.required]] });

  async submit() {
    if (this.form.invalid || this.busy()) return this.form.markAllAsTouched();
    await this.run(async () => {
      const res = await this.store.login(this.form.getRawValue());
      if (res.status === 'mfa_required') this.challengeId.set(res.challengeId);
      else await this.goIn();
    });
  }

  async submitMfa() {
    const challengeId = this.challengeId();
    if (!challengeId || this.mfaForm.invalid || this.busy()) return;
    await this.run(async () => {
      await this.store.loginMfa(challengeId, this.mfaForm.getRawValue().code.trim());
      await this.goIn();
    });
  }

  async resendVerification() {
    const identifier = this.form.getRawValue().identifier;
    if (!identifier.includes('@')) {
      this.info.set('Wpisz adres e-mail w polu logowania, aby wysłać link ponownie.');
      return;
    }
    await this.run(async () => {
      await firstValueFrom(this.http.post('/api/auth/resend-verification', { email: identifier }));
      this.info.set('Jeśli konto istnieje i nie jest potwierdzone, wysłaliśmy nowy link.');
      this.unverified.set(false);
    });
  }

  backToCredentials() {
    this.challengeId.set(null);
    this.mfaForm.reset();
    this.form.controls.password.reset();
  }

  private async goIn() {
    const target = this.returnUrl();
    // Only allow in-app redirects.
    await this.router.navigateByUrl(target?.startsWith('/app') ? target : '/app');
  }

  private async run(fn: () => Promise<void>) {
    this.busy.set(true);
    this.error.set(null);
    this.info.set(null);
    try {
      await fn();
    } catch (err) {
      const e = toApiError(err);
      if (e.code === 'mfa_expired') this.backToCredentials();
      this.unverified.set(e.code === 'email_not_verified');
      this.error.set(e.message);
    } finally {
      this.busy.set(false);
    }
  }
}
