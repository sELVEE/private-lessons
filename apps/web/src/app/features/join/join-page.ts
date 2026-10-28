import { Component, inject, type OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import type { InvitePreview } from '@pl/shared';
import { toApiError } from '../../core/api-error';
import { pendingInvite } from '../../core/pending-invite';
import { TeachingApi } from '../../core/teaching-api';

@Component({
  selector: 'pl-join-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <div class="page">
      <mat-card appearance="outlined" class="auth-card">
        <mat-card-header><mat-card-title>Dołącz do korepetytora</mat-card-title></mat-card-header>
        <mat-card-content>
          @if (error(); as e) {
            <div class="error-banner" role="alert">{{ e }}</div>
          }
          @if (preview(); as p) {
            @if (p.alreadyEnrolled) {
              <div class="info-banner">
                Już uczysz się u {{ p.tutorName }} ({{ p.subjectName }}).
              </div>
            } @else {
              <p>
                <strong>{{ p.tutorName }}</strong> zaprasza Cię na korepetycje z przedmiotu
                <strong>{{ p.subjectName }}</strong
                >.
              </p>
              <p class="muted">
                Korepetytor zobaczy Twoje imię, e-mail, poziom szkoły i klasę. Rok urodzenia widzi
                tylko jako przybliżony wiek.
              </p>
            }
          } @else {
            <form (ngSubmit)="check()" class="form-stack">
              <mat-form-field>
                <mat-label>Kod zaproszenia</mat-label>
                <input
                  matInput
                  [formControl]="code"
                  placeholder="ABCD-2345"
                  autocapitalize="characters"
                />
              </mat-form-field>
              <button mat-flat-button type="submit" [disabled]="code.invalid || busy()">
                Sprawdź
              </button>
            </form>
          }
        </mat-card-content>
        @if (preview(); as p) {
          <mat-card-actions align="end">
            <button mat-button (click)="cancel()">Anuluj</button>
            @if (!p.alreadyEnrolled) {
              <button mat-flat-button (click)="join()" [disabled]="busy()">Dołącz</button>
            }
          </mat-card-actions>
        }
      </mat-card>
    </div>
  `,
})
export default class JoinPage implements OnInit {
  private readonly api = inject(TeachingApi);
  private readonly router = inject(Router);
  readonly code = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(8)],
  });
  readonly preview = signal<InvitePreview | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  ngOnInit() {
    const pending = pendingInvite.get();
    if (pending) {
      this.code.setValue(pending);
      return this.check();
    }
    return undefined;
  }

  check() {
    return this.run(async () => this.preview.set(await this.api.previewInvite(this.code.value)));
  }

  join() {
    return this.run(async () => {
      await this.api.redeemInvite(this.code.value);
      pendingInvite.clear();
      await this.router.navigate(['/app'], { queryParams: { joined: 1 } });
    });
  }

  cancel() {
    pendingInvite.clear();
    this.preview.set(null);
    this.code.reset();
  }

  private async run(fn: () => Promise<void>) {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch (err) {
      const e = toApiError(err);
      if (e.code === 'invalid_invite' || e.code === 'forbidden') pendingInvite.clear();
      this.error.set(e.message);
    } finally {
      this.busy.set(false);
    }
  }
}
