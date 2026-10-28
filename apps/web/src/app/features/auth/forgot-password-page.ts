import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/api-error';

@Component({
  selector: 'pl-forgot-password-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <div class="auth-page">
      <mat-card appearance="outlined" class="auth-card">
        <mat-card-header><mat-card-title>Nie pamiętam hasła</mat-card-title></mat-card-header>
        <mat-card-content>
          @if (sent()) {
            <div class="info-banner" role="status">
              Jeśli konto z tym adresem istnieje, wysłaliśmy link do ustawienia nowego hasła. Link
              jest ważny 30 minut.
            </div>
          } @else {
            @if (error(); as message) {
              <div class="error-banner" role="alert">{{ message }}</div>
            }
            <form [formGroup]="form" (ngSubmit)="submit()" class="form-stack" novalidate>
              <p class="muted">Podaj adres e-mail konta. Wyślemy link do zmiany hasła.</p>
              <mat-form-field>
                <mat-label>E-mail</mat-label>
                <input matInput type="email" formControlName="email" autocomplete="email" />
                <mat-error>Podaj poprawny adres e-mail</mat-error>
              </mat-form-field>
              <div class="row-actions">
                <a mat-button routerLink="/login">Wróć</a>
                <button mat-flat-button type="submit" [disabled]="busy()">Wyślij link</button>
              </div>
            </form>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export default class ForgotPasswordPage {
  private readonly http = inject(HttpClient);
  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });
  readonly busy = signal(false);
  readonly sent = signal(false);
  readonly error = signal<string | null>(null);

  async submit() {
    if (this.form.invalid) return this.form.markAllAsTouched();
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post('/api/auth/forgot-password', this.form.getRawValue()));
      this.sent.set(true);
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.busy.set(false);
    }
  }
}
