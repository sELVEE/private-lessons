import { Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth.store';
import { TokenAction } from './token-action';

@Component({
  selector: 'pl-not-me-page',
  imports: [MatButtonModule, MatCardModule, RouterLink],
  template: `
    <div class="auth-page">
      <mat-card appearance="outlined" class="auth-card">
        <mat-card-header><mat-card-title>To nie ja się logowałem</mat-card-title></mat-card-header>
        <mat-card-content>
          @if (action.state() === 'done') {
            <div class="info-banner" role="status">
              Konto zablokowane, wszystkie urządzenia wylogowane. Aby odzyskać dostęp, ustaw nowe
              hasło.
            </div>
            <a mat-flat-button routerLink="/forgot-password">Ustaw nowe hasło</a>
          } @else {
            @if (action.error(); as message) {
              <div class="error-banner" role="alert">{{ message }}</div>
            }
            <p>
              Zablokujemy konto i wylogujemy wszystkie urządzenia. Potem ustawisz nowe hasło przez
              e-mail.
            </p>
          }
        </mat-card-content>
        @if (action.state() !== 'done') {
          <mat-card-actions align="end">
            <button mat-flat-button (click)="lock()" [disabled]="action.state() === 'busy'">
              Zablokuj konto
            </button>
          </mat-card-actions>
        }
      </mat-card>
    </div>
  `,
})
export default class NotMePage {
  private readonly store = inject(AuthStore);
  readonly token = input<string>();
  readonly action = new TokenAction();

  async lock() {
    if (await this.action.post('/api/auth/not-me', { token: this.token() ?? '' }))
      this.store.clear(false);
  }
}
