import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { SCHOOL_LEVEL_LABELS } from '@pl/shared';
import { AuthStore } from '../../core/auth.store';

/** Role-specific dashboard. Widgets fill in as later stages land. */
@Component({
  selector: 'pl-home-page',
  imports: [MatButtonModule, MatCardModule, MatIconModule, RouterLink],
  template: `
    <div class="page">
      <h1>Cześć, {{ me()?.displayName }}!</h1>

      @if (!me()?.mfaEnabled) {
        <div class="info-banner">
          Zabezpiecz konto weryfikacją dwuetapową.
          <a mat-button routerLink="/app/account">Włącz</a>
        </div>
      }

      <div class="grid">
        @switch (role()) {
          @case ('tutor') {
            <mat-card appearance="outlined">
              <mat-card-header><mat-card-title>Najbliższe lekcje</mat-card-title></mat-card-header>
              <mat-card-content class="muted">Kalendarz pojawi się w etapie 3.</mat-card-content>
            </mat-card>
            <mat-card appearance="outlined">
              <mat-card-header><mat-card-title>Uczniowie</mat-card-title></mat-card-header>
              <mat-card-content class="muted"
                >Zapraszanie uczniów pojawi się w etapie 2.</mat-card-content
              >
            </mat-card>
            <mat-card appearance="outlined">
              <mat-card-header
                ><mat-card-title>Zarobki w tym miesiącu</mat-card-title></mat-card-header
              >
              <mat-card-content class="muted">Rozliczenia pojawią się w etapie 5.</mat-card-content>
            </mat-card>
          }
          @case ('student') {
            <mat-card appearance="outlined">
              <mat-card-header><mat-card-title>Mój profil</mat-card-title></mat-card-header>
              <mat-card-content>
                <p>
                  {{ schoolLabel() }}
                  @if (me()?.student?.grade) {
                    , klasa {{ me()?.student?.grade }}
                  }
                </p>
              </mat-card-content>
            </mat-card>
            <mat-card appearance="outlined">
              <mat-card-header><mat-card-title>Najbliższe lekcje</mat-card-title></mat-card-header>
              <mat-card-content class="muted">Plan lekcji pojawi się w etapie 3.</mat-card-content>
            </mat-card>
            <mat-card appearance="outlined">
              <mat-card-header><mat-card-title>Zadania domowe</mat-card-title></mat-card-header>
              <mat-card-content class="muted">Zadania pojawią się w etapie 6.</mat-card-content>
            </mat-card>
          }
          @case ('parent') {
            <mat-card appearance="outlined">
              <mat-card-header><mat-card-title>Moje dzieci</mat-card-title></mat-card-header>
              <mat-card-content class="muted"
                >Łączenie kont z dziećmi pojawi się w etapie 2.</mat-card-content
              >
            </mat-card>
          }
          @case ('admin') {
            <mat-card appearance="outlined">
              <mat-card-header><mat-card-title>Administracja</mat-card-title></mat-card-header>
              <mat-card-content class="muted"
                >Panel administracyjny pojawi się w etapie 2.</mat-card-content
              >
            </mat-card>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
    }
  `,
})
export default class HomePage {
  private readonly store = inject(AuthStore);
  readonly me = this.store.me;
  readonly role = this.store.role;
  readonly schoolLabel = computed(() => {
    const level = this.me()?.student?.schoolLevel;
    return level ? SCHOOL_LEVEL_LABELS[level] : '';
  });
}
