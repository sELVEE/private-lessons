import { Component, inject, input, type OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { Router, RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth.store';
import { pendingInvite } from '../../core/pending-invite';

/** Public target of invite links: remembers the code and sends the visitor to log in or sign up. */
@Component({
  selector: 'pl-join-landing-page',
  imports: [MatButtonModule, MatCardModule, RouterLink],
  template: `
    <div class="auth-page">
      <mat-card appearance="outlined" class="auth-card">
        <mat-card-header
          ><mat-card-title>Zaproszenie na korepetycje</mat-card-title></mat-card-header
        >
        <mat-card-content>
          <p>
            Korepetytor zaprosił Cię do współpracy. Zaloguj się albo załóż konto ucznia — potem od
            razu dołączysz.
          </p>
        </mat-card-content>
        <mat-card-actions align="end">
          <a mat-button routerLink="/register">Załóż konto</a>
          <a mat-flat-button routerLink="/login">Zaloguj się</a>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
})
export default class JoinLandingPage implements OnInit {
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  readonly code = input<string>();

  async ngOnInit() {
    const code = this.code();
    if (code) pendingInvite.set(code);
    await this.store.ensureLoaded();
    if (this.store.isLoggedIn()) await this.router.navigate(['/app/join'], { replaceUrl: true });
  }
}
