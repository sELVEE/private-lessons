import { Component, input, type OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TokenAction } from './token-action';

@Component({
  selector: 'pl-parent-consent-page',
  imports: [MatButtonModule, MatCardModule, MatProgressBarModule],
  template: `
    <div class="auth-page">
      <mat-card appearance="outlined" class="auth-card">
        <mat-card-header><mat-card-title>Zgoda rodzica</mat-card-title></mat-card-header>
        <mat-card-content>
          @if (inspect.error() || confirm.error(); as message) {
            <div class="error-banner" role="alert">{{ message }}</div>
          }
          @if (confirm.state() === 'done') {
            <div class="info-banner" role="status">Dziękujemy! Konto dziecka jest aktywne.</div>
          } @else if (inspect.result(); as info) {
            <p>
              <strong>{{ info.studentName }}</strong> założył(a) konto na platformie korepetycji i
              wskazał(a) Cię jako rodzica lub opiekuna.
            </p>
            <p>Na koncie przechowujemy wyłącznie:</p>
            <ul>
              <li>imię lub pseudonim, adres e-mail i login dziecka,</li>
              <li>poziom szkoły, klasę i rok urodzenia,</li>
              <li>dane o lekcjach, notatkach i postępach w nauce.</li>
            </ul>
            <p class="muted">
              Twojego adresu e-mail nie zapisujemy. Zgodę możesz wycofać w każdej chwili.
            </p>
          }
        </mat-card-content>
        @if (inspect.result() && confirm.state() !== 'done') {
          <mat-card-actions align="end">
            <button mat-flat-button (click)="accept()" [disabled]="confirm.state() === 'busy'">
              Wyrażam zgodę
            </button>
          </mat-card-actions>
        }
      </mat-card>
    </div>
  `,
})
export default class ParentConsentPage implements OnInit {
  readonly token = input<string>();
  readonly inspect = new TokenAction<{ studentName: string }>();
  readonly confirm = new TokenAction();

  ngOnInit() {
    void this.inspect.post('/api/auth/parent-consent/inspect', { token: this.token() ?? '' });
  }

  accept() {
    void this.confirm.post('/api/auth/parent-consent/confirm', { token: this.token() ?? '' });
  }
}
