import { Component, inject, type OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import type { SubjectInfo } from '@pl/shared';
import { toApiError } from '../../core/api-error';
import { TeachingApi } from '../../core/teaching-api';

@Component({
  selector: 'pl-subjects-page',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <div class="page">
      <h1>Przedmioty i tematy</h1>
      <p class="muted">
        Tematy posłużą później do planowania lekcji, materiałów i śledzenia postępów.
      </p>
      @if (error(); as e) {
        <div class="error-banner" role="alert">{{ e }}</div>
      }

      <form class="add" (ngSubmit)="addSubject()">
        <mat-form-field>
          <mat-label>Nowy przedmiot</mat-label>
          <input matInput [formControl]="newSubject" placeholder="np. Fizyka" />
        </mat-form-field>
        <button mat-flat-button type="submit" [disabled]="newSubject.invalid">Dodaj</button>
      </form>

      <div class="list">
        @for (s of subjects(); track s.id) {
          <mat-card appearance="outlined">
            <mat-card-header>
              <mat-card-title>{{ s.name }}</mat-card-title>
              <button
                mat-icon-button
                class="end"
                (click)="removeSubject(s)"
                aria-label="Usuń przedmiot"
              >
                <mat-icon fontSet="material-symbols-outlined">delete</mat-icon>
              </button>
            </mat-card-header>
            <mat-card-content>
              <mat-chip-set aria-label="Tematy">
                @for (t of s.topics; track t.id) {
                  <mat-chip (removed)="removeTopic(t.id)">
                    {{ t.name }}
                    <button matChipRemove [attr.aria-label]="'Usuń temat ' + t.name">
                      <mat-icon fontSet="material-symbols-outlined">cancel</mat-icon>
                    </button>
                  </mat-chip>
                } @empty {
                  <span class="muted">Brak tematów</span>
                }
              </mat-chip-set>
              <form class="add topic" (ngSubmit)="addTopic(s)">
                <mat-form-field subscriptSizing="dynamic">
                  <mat-label>Dodaj temat</mat-label>
                  <input
                    matInput
                    [formControl]="topicControl(s.id)"
                    placeholder="np. Funkcje kwadratowe"
                  />
                </mat-form-field>
                <button mat-stroked-button type="submit" [disabled]="topicControl(s.id).invalid">
                  Dodaj
                </button>
              </form>
            </mat-card-content>
          </mat-card>
        }
      </div>
    </div>
  `,
  styles: `
    .add {
      display: flex;
      gap: 12px;
      align-items: baseline;
      flex-wrap: wrap;
    }
    .topic {
      margin-top: 16px;
    }
    .list {
      display: grid;
      gap: 16px;
    }
    .end {
      margin-left: auto;
    }
  `,
})
export default class SubjectsPage implements OnInit {
  private readonly api = inject(TeachingApi);
  readonly subjects = signal<SubjectInfo[]>([]);
  readonly error = signal<string | null>(null);
  readonly newSubject = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2)],
  });
  private readonly topicControls = new Map<string, FormControl<string>>();

  ngOnInit() {
    return this.reload();
  }

  topicControl(id: string) {
    let c = this.topicControls.get(id);
    if (!c) {
      c = new FormControl('', { nonNullable: true, validators: [Validators.required] });
      this.topicControls.set(id, c);
    }
    return c;
  }

  addSubject() {
    return this.run(async () => {
      await this.api.createSubject(this.newSubject.value.trim());
      this.newSubject.reset();
    });
  }

  removeSubject(s: SubjectInfo) {
    if (!confirm(`Usunąć przedmiot „${s.name}” razem z tematami?`)) return;
    return this.run(() => this.api.deleteSubject(s.id));
  }

  addTopic(s: SubjectInfo) {
    const c = this.topicControl(s.id);
    return this.run(async () => {
      await this.api.addTopic(s.id, c.value.trim());
      c.reset();
    });
  }

  removeTopic(id: string) {
    return this.run(() => this.api.deleteTopic(id));
  }

  private async run(fn: () => Promise<unknown>) {
    this.error.set(null);
    try {
      await fn();
      await this.reload();
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }

  private async reload() {
    try {
      this.subjects.set(await this.api.subjects());
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }
}
