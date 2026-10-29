import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatListModule } from '@angular/material/list';
import { RouterLink } from '@angular/router';
import type { EnrollmentInfo } from '@pl/shared';
import { toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { TeachingApi } from '../../core/teaching-api';
import { studentLevel } from '../labels';

@Component({
  selector: 'pl-progress-list-page',
  imports: [MatCardModule, MatListModule, RouterLink],
  template: `
    <div class="page">
      <h1>Postępy</h1>
      @if (error(); as e) {
        <div class="error-banner" role="alert">{{ e }}</div>
      }
      <mat-card appearance="outlined">
        <mat-list>
          @for (e of list(); track e.id) {
            <a mat-list-item [routerLink]="['/app/progress', e.id]">
              <span matListItemTitle>{{
                isTutor() ? e.student.displayName : e.subject.name + ' — ' + e.tutor.displayName
              }}</span>
              <span matListItemLine class="muted">
                {{
                  isTutor()
                    ? e.subject.name + ' · ' + level(e.student)
                    : role() === 'parent'
                      ? e.student.displayName
                      : ''
                }}
              </span>
            </a>
          } @empty {
            <p class="muted" style="padding: 16px">Brak współprac.</p>
          }
        </mat-list>
      </mat-card>
    </div>
  `,
})
export default class ProgressListPage implements OnInit {
  private readonly api = inject(TeachingApi);
  private readonly store = inject(AuthStore);
  readonly role = this.store.role;
  readonly isTutor = computed(() => this.role() === 'tutor');
  readonly level = studentLevel;
  readonly all = signal<EnrollmentInfo[]>([]);
  readonly list = computed(() => this.all().filter((e) => e.status !== 'ended'));
  readonly error = signal<string | null>(null);

  async ngOnInit() {
    try {
      this.all.set(await this.api.enrollments());
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }
}
