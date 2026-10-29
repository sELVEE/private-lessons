import { DatePipe, Location } from '@angular/common';
import { Component, computed, inject, input, type OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { RouterLink } from '@angular/router';
import {
  ATTENDANCE_LABELS,
  type EnrollmentDetail,
  type EnrollmentStatus,
  LESSON_STATUS_LABELS,
  type LessonInfo,
} from '@pl/shared';
import { toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { TeachingApi } from '../../core/teaching-api';
import { EVENT_LABELS, statusLabel, studentLevel } from '../labels';

/** One cooperation (tutor × student × subject). Editable only by its tutor; the API enforces it. */
@Component({
  selector: 'pl-enrollment-detail-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    RouterLink,
  ],
  templateUrl: './enrollment-detail-page.html',
  styles: `
    .head {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
      align-items: start;
    }
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 8px 16px;
      margin: 0;
    }
    dt {
      color: var(--mat-sys-on-surface-variant);
    }
    dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .goals {
      white-space: pre-wrap;
    }
    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 16px;
    }
  `,
})
export default class EnrollmentDetailPage implements OnInit {
  private readonly api = inject(TeachingApi);
  private readonly store = inject(AuthStore);
  readonly location = inject(Location);

  readonly id = input.required<string>();
  readonly e = signal<EnrollmentDetail | null>(null);
  readonly error = signal<string | null>(null);
  readonly editing = signal(false);
  readonly busy = signal(false);
  readonly lessons = signal<LessonInfo[]>([]);
  readonly lessonStatus = LESSON_STATUS_LABELS;
  readonly attendanceLabel = ATTENDANCE_LABELS;
  /** Attendance over completed lessons, plus cancellations. */
  readonly stats = computed(() => {
    const ls = this.lessons();
    const done = ls.filter((l) => l.status === 'completed');
    const present = done.filter((l) => l.attendance !== 'absent').length;
    return {
      completed: done.length,
      absent: done.length - present,
      cancelled: ls.filter((l) => l.status === 'cancelled').length,
      rate: done.length ? Math.round((present / done.length) * 100) : null,
      upcoming: ls.filter((l) => l.status === 'scheduled' && Date.parse(l.startsAt) > Date.now())
        .length,
    };
  });
  readonly history = computed(() => [...this.lessons()].reverse().slice(0, 15));
  readonly goals = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(2000)],
  });

  readonly isTutor = computed(() => this.e()?.tutor.id === this.store.me()?.id);
  readonly level = studentLevel;
  readonly statusLabel = statusLabel;
  readonly eventLabel = (t: string) => EVENT_LABELS[t] ?? t;

  async ngOnInit() {
    try {
      this.e.set(await this.api.enrollment(this.id()));
      const day = 24 * 3600_000;
      this.lessons.set(
        await this.api.lessons(
          new Date(Date.now() - 365 * day),
          new Date(Date.now() + 60 * day),
          this.id(),
        ),
      );
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }

  startEdit() {
    this.goals.setValue(this.e()?.goals ?? '');
    this.editing.set(true);
  }

  saveGoals() {
    if (this.goals.invalid) return;
    return this.update({ goals: this.goals.value.trim() || null }).then(() =>
      this.editing.set(false),
    );
  }

  setStatus(status: EnrollmentStatus) {
    return this.update({ status });
  }

  private async update(patch: { goals?: string | null; status?: EnrollmentStatus }) {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.e.set(await this.api.updateEnrollment(this.id(), patch));
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.busy.set(false);
    }
  }
}
