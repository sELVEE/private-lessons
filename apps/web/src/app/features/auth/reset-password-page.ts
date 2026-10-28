import { Component, inject, input } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import { PASSWORD_MIN_LENGTH } from '@pl/shared';
import { TokenAction } from './token-action';

@Component({
  selector: 'pl-reset-password-page',
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
        <mat-card-header><mat-card-title>Ustaw nowe hasło</mat-card-title></mat-card-header>
        <mat-card-content>
          @if (action.state() === 'done') {
            <div class="info-banner" role="status">
              Hasło zmienione. Wylogowaliśmy wszystkie urządzenia — zaloguj się nowym hasłem.
            </div>
            <a mat-flat-button routerLink="/login">Zaloguj się</a>
          } @else {
            @if (action.error(); as message) {
              <div class="error-banner" role="alert">{{ message }}</div>
            }
            <form [formGroup]="form" (ngSubmit)="submit()" class="form-stack" novalidate>
              <mat-form-field>
                <mat-label>Nowe hasło</mat-label>
                <input
                  matInput
                  type="password"
                  formControlName="password"
                  autocomplete="new-password"
                />
                <mat-hint>Co najmniej {{ min }} znaków</mat-hint>
                <mat-error>Hasło musi mieć co najmniej {{ min }} znaków</mat-error>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Powtórz hasło</mat-label>
                <input
                  matInput
                  type="password"
                  formControlName="repeat"
                  autocomplete="new-password"
                />
                <mat-error>Hasła muszą być takie same</mat-error>
              </mat-form-field>
              <div class="row-actions">
                <a mat-button routerLink="/forgot-password">Wyślij nowy link</a>
                <button mat-flat-button type="submit" [disabled]="action.state() === 'busy'">
                  Zapisz
                </button>
              </div>
            </form>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export default class ResetPasswordPage {
  readonly token = input<string>();
  readonly min = PASSWORD_MIN_LENGTH;
  readonly action = new TokenAction();
  readonly form = inject(NonNullableFormBuilder).group({
    password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]],
    repeat: ['', Validators.required],
  });

  async submit() {
    const { password, repeat } = this.form.getRawValue();
    if (password !== repeat) this.form.controls.repeat.setErrors({ mismatch: true });
    if (this.form.invalid) return this.form.markAllAsTouched();
    await this.action.post('/api/auth/reset-password', { token: this.token() ?? '', password });
  }
}
