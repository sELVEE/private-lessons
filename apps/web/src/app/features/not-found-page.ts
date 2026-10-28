import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'pl-not-found',
  imports: [MatButtonModule, RouterLink],
  template: `
    <div class="auth-page">
      <div style="text-align: center">
        <h1>404</h1>
        <p class="muted">Nie ma takiej strony.</p>
        <a mat-flat-button routerLink="/">Wróć na start</a>
      </div>
    </div>
  `,
})
export default class NotFoundPage {}
