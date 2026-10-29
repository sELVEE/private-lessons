import { DatePipe } from '@angular/common';
import { Component, inject, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import {
  type ParentLinkCode,
  type ParentLinkInfo,
  SCHOOL_LEVEL_LABELS,
  SCHOOL_LEVEL_MAX_GRADE,
  SCHOOL_LEVELS,
  type SchoolLevel,
} from '@pl/shared';
import { applyServerErrors, toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { TeachingApi } from '../../core/teaching-api';

/** Student-only account sections: school profile and parent links. */
@Component({
  selector: 'pl-student-settings',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatListModule,
    MatSelectModule,
  ],
  template: `
    @if (error(); as e) {
      <div class="error-banner" role="alert">{{ e }}</div>
    }
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar fontSet="material-symbols-outlined">school</mat-icon>
        <mat-card-title>Szkoła</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <form [formGroup]="profile" (ngSubmit)="saveProfile()" class="inline">
          <mat-form-field>
            <mat-label>Poziom</mat-label>
            <mat-select formControlName="schoolLevel">
              @for (l of levels; track l.value) {
                <mat-option [value]="l.value">{{ l.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Klasa</mat-label>
            <mat-select formControlName="grade">
              <mat-option [value]="null">—</mat-option>
              @for (g of grades(); track g) {
                <mat-option [value]="g">{{ g }}</mat-option>
              }
            </mat-select>
            <mat-error>{{ profile.controls.grade.errors?.['server'] }}</mat-error>
          </mat-form-field>
          <button mat-flat-button type="submit">Zapisz</button>
        </form>
        @if (saved()) {
          <span class="muted">Zapisano.</span>
        }
      </mat-card-content>
    </mat-card>

    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar fontSet="material-symbols-outlined">family_restroom</mat-icon>
        <mat-card-title>Rodzice</mat-card-title>
        <mat-card-subtitle>Połączony rodzic widzi Twoje lekcje i postępy</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <mat-list>
          @for (l of links(); track l.id) {
            <mat-list-item>
              <span matListItemTitle>{{ l.parent.displayName }}</span>
              <span matListItemLine class="muted"
                >połączono {{ l.createdAt | date: 'd.MM.yyyy' }}</span
              >
              <button mat-button matListItemMeta (click)="remove(l)">Usuń</button>
            </mat-list-item>
          } @empty {
            <p class="muted">Brak połączonych rodziców.</p>
          }
        </mat-list>
        @if (code(); as c) {
          <div class="info-banner">
            Podaj rodzicowi kod <strong class="code">{{ c.code }}</strong> — wpisze go w zakładce
            „Dzieci”. Ważny do {{ c.expiresAt | date: 'd.MM HH:mm' }}.
          </div>
        }
        <button mat-stroked-button (click)="generate()">Wygeneruj kod dla rodzica</button>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    :host {
      display: grid;
      gap: 16px;
    }
    .inline {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    .code {
      font-family: ui-monospace, monospace;
      letter-spacing: 0.1em;
    }
    mat-icon[mat-card-avatar] {
      display: grid;
      place-items: center;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
  `,
})
export class StudentSettings implements OnInit {
  private readonly api = inject(TeachingApi);
  private readonly store = inject(AuthStore);

  readonly levels = SCHOOL_LEVELS.map((value) => ({ value, label: SCHOOL_LEVEL_LABELS[value] }));
  readonly links = signal<ParentLinkInfo[]>([]);
  readonly code = signal<ParentLinkCode | null>(null);
  readonly error = signal<string | null>(null);
  readonly saved = signal(false);

  readonly profile = inject(NonNullableFormBuilder).group({
    schoolLevel: this.store.me()?.student?.schoolLevel ?? ('primary' as SchoolLevel),
    grade: this.store.me()?.student?.grade ?? (null as number | null),
  });
  readonly grades = signal<number[]>([]);

  async ngOnInit() {
    this.updateGrades(this.profile.controls.schoolLevel.value);
    this.profile.controls.schoolLevel.valueChanges.subscribe((l) => {
      this.updateGrades(l);
      this.profile.controls.grade.setValue(null);
    });
    try {
      this.links.set(await this.api.parentLinks());
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }

  async saveProfile() {
    this.saved.set(false);
    this.error.set(null);
    try {
      const { schoolLevel, grade } = this.profile.getRawValue();
      await this.api.updateProfile(schoolLevel, grade);
      await this.store.refresh();
      this.saved.set(true);
    } catch (err) {
      this.error.set(applyServerErrors(this.profile, err));
    }
  }

  async generate() {
    try {
      this.code.set(await this.api.parentCode());
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }

  async remove(l: ParentLinkInfo) {
    if (!confirm(`Odłączyć ${l.parent.displayName}? Straci wgląd w Twoje lekcje.`)) return;
    try {
      await this.api.removeParentLink(l.id);
      this.links.update((list) => list.filter((x) => x.id !== l.id));
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }

  private updateGrades(level: SchoolLevel) {
    const max = SCHOOL_LEVEL_MAX_GRADE[level];
    this.grades.set(max ? Array.from({ length: max }, (_, i) => i + 1) : []);
  }
}
