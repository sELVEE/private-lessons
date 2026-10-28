import { Component, input, type OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { TokenAction } from './token-action';

@Component({
  selector: 'pl-verify-email-page',
  imports: [MatButtonModule, MatCardModule, MatProgressBarModule, RouterLink],
  template: `
    <div class="auth-page">
      <mat-card appearance="outlined" class="auth-card">
        @if (action.state() === 'busy') {
          <mat-progress-bar mode="indeterminate" />
        }
        <mat-card-header
          ><mat-card-title>Potwierdzenie adresu e-mail</mat-card-title></mat-card-header
        >
        <mat-card-content>
          @switch (action.state()) {
            @case ('done') {
              <div class="info-banner" role="status">
                Adres potwierdzony.
                @if (action.result()?.parentConsentPending) {
                  Czekamy jeszcze na zgodę rodzica — wysłaliśmy mu e-mail.
                } @else {
                  Możesz się zalogować.
                }
              </div>
            }
            @case ('error') {
              <div class="error-banner" role="alert">{{ action.error() }}</div>
              <p class="muted">Link mógł wygasnąć. Zaloguj się, a wyślemy nowy.</p>
            }
          }
        </mat-card-content>
        <mat-card-actions>
          <a mat-flat-button routerLink="/login">Przejdź do logowania</a>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
})
export default class VerifyEmailPage implements OnInit {
  readonly token = input<string>();
  readonly action = new TokenAction<{ parentConsentPending: boolean }>();

  ngOnInit() {
    void this.action.post('/api/auth/verify-email', { token: this.token() ?? '' });
  }
}
