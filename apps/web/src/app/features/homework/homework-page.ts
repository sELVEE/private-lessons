import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, type OnInit, signal } from '@angular/core';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  type EnrollmentInfo,
  HOMEWORK_STATUS_LABELS,
  type HomeworkInfo,
  type HomeworkStatus,
} from '@pl/shared';
import { applyServerErrors, toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { TeachingApi } from '../../core/teaching-api';
import { Markdown } from '../../shared/markdown';

@Component({
  selector: 'pl-homework-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    Markdown,
  ],
  templateUrl: './homework-page.html',
  styles: `
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .list {
      display: grid;
      gap: 12px;
      margin-top: 16px;
    }
    .panel {
      margin: 16px 0;
      max-width: 720px;
    }
    .overdue {
      color: var(--mat-sys-error);
    }
    .answer {
      border-left: 3px solid var(--mat-sys-primary);
      padding-left: 12px;
      margin: 12px 0;
    }
    .feedback {
      border-left: 3px solid var(--mat-sys-tertiary);
      padding-left: 12px;
      margin: 12px 0;
    }
    .grade {
      font: var(--mat-sys-title-medium);
    }
  `,
})
export default class HomeworkPage implements OnInit {
  private readonly api = inject(TeachingApi);
  private readonly store = inject(AuthStore);
  private readonly fb = inject(NonNullableFormBuilder);

  /** `?new=1` (szybka akcja z ekranu „Teraz”) otwiera formularz zadania. */
  readonly new = input<string>();

  readonly role = this.store.role;
  readonly isTutor = computed(() => this.role() === 'tutor');
  readonly statusLabel = HOMEWORK_STATUS_LABELS;

  readonly items = signal<HomeworkInfo[]>([]);
  readonly enrollments = signal<EnrollmentInfo[]>([]);
  readonly filter = signal<HomeworkStatus | 'all'>('all');
  readonly showAssign = signal(false);
  readonly answering = signal<string | null>(null);
  readonly reviewing = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly visible = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.items() : this.items().filter((h) => h.status === f);
  });
  readonly activeEnrollments = computed(() =>
    this.enrollments().filter((e) => e.status === 'active'),
  );

  readonly assignForm = this.fb.group({
    enrollmentId: ['', Validators.required],
    title: ['', [Validators.required, Validators.minLength(2)]],
    instructions: [''],
    dueAt: [''],
  });
  readonly answer = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  readonly reviewForm = this.fb.group({ feedback: [''], grade: [''] });

  async ngOnInit() {
    try {
      if (this.isTutor()) this.enrollments.set(await this.api.enrollments());
      await this.reload();
      if (this.isTutor() && this.new()) this.openAssign();
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }

  openAssign() {
    if (!this.assignForm.value.enrollmentId && this.activeEnrollments()[0]) {
      this.assignForm.patchValue({ enrollmentId: this.activeEnrollments()[0]!.id });
    }
    this.showAssign.set(true);
  }

  assign() {
    if (this.assignForm.invalid) return this.assignForm.markAllAsTouched();
    const v = this.assignForm.getRawValue();
    return this.run(async () => {
      await this.api.assignHomework({
        enrollmentId: v.enrollmentId,
        title: v.title,
        instructions: v.instructions,
        dueAt: v.dueAt ? new Date(`${v.dueAt}T20:00:00`).toISOString() : null,
      });
      this.assignForm.patchValue({ title: '', instructions: '', dueAt: '' });
      this.showAssign.set(false);
    }, this.assignForm);
  }

  startAnswer(h: HomeworkInfo) {
    this.answer.setValue(h.submission ?? '');
    this.answering.set(h.id);
  }

  submit(h: HomeworkInfo) {
    if (this.answer.invalid) return;
    return this.run(async () => {
      await this.api.submitHomework(h.id, this.answer.value);
      this.answering.set(null);
    });
  }

  startReview(h: HomeworkInfo) {
    this.reviewForm.setValue({ feedback: h.feedback ?? '', grade: h.grade ?? '' });
    this.reviewing.set(h.id);
  }

  review(h: HomeworkInfo) {
    const v = this.reviewForm.getRawValue();
    return this.run(async () => {
      await this.api.reviewHomework(h.id, v.feedback, v.grade || undefined);
      this.reviewing.set(null);
    });
  }

  remove(h: HomeworkInfo) {
    if (!confirm(`Usunąć zadanie „${h.title}”?`)) return;
    return this.run(() => this.api.deleteHomework(h.id));
  }

  isOverdue(h: HomeworkInfo) {
    return h.status === 'assigned' && !!h.dueAt && Date.parse(h.dueAt) < Date.now();
  }

  private async run(fn: () => Promise<unknown>, form?: Parameters<typeof applyServerErrors>[0]) {
    this.error.set(null);
    try {
      await fn();
      await this.reload();
    } catch (err) {
      this.error.set(form ? applyServerErrors(form, err) : toApiError(err).message);
    }
  }

  private async reload() {
    this.items.set(await this.api.homework());
  }
}
