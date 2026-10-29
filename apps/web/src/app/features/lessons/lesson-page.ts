import { DatePipe, Location } from '@angular/common';
import { Component, computed, inject, input, type OnInit, signal } from '@angular/core';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  ATTENDANCE_LABELS,
  LESSON_STATUS_LABELS,
  type LessonDetail,
  type NoteInfo,
  type ReportInfo,
} from '@pl/shared';
import { applyServerErrors, toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { TeachingApi } from '../../core/teaching-api';

const CHANGE_LABELS: Record<string, string> = {
  scheduled: 'Zaplanowano',
  rescheduled: 'Przełożono',
  cancelled: 'Odwołano',
  completed: 'Oznaczono obecność',
  charge_confirmed: 'Odwołanie płatne',
  charge_waived: 'Odwołanie bez opłaty',
};

/** One lesson: details, the shared note (tutor + student) and the tutor's report. */
@Component({
  selector: 'pl-lesson-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './lesson-page.html',
  styles: `
    .head {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
      align-items: start;
    }
    .pre {
      white-space: pre-wrap;
    }
    textarea {
      font-family: inherit;
    }
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 6px 16px;
      margin: 0 0 12px;
    }
    dt {
      color: var(--mat-sys-on-surface-variant);
    }
    dd {
      margin: 0;
    }
    .rev {
      border-top: 1px solid var(--mat-sys-outline-variant);
      padding: 8px 0;
    }
  `,
})
export default class LessonPage implements OnInit {
  private readonly api = inject(TeachingApi);
  private readonly store = inject(AuthStore);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly location = inject(Location);

  readonly id = input.required<string>();
  readonly lesson = signal<LessonDetail | null>(null);
  readonly note = signal<NoteInfo | null>(null);
  readonly report = signal<ReportInfo | null>(null);
  readonly error = signal<string | null>(null);
  readonly saved = signal<string | null>(null);
  readonly editingReport = signal(false);

  readonly statusLabel = LESSON_STATUS_LABELS;
  readonly attendanceLabel = ATTENDANCE_LABELS;
  readonly changeLabel = (t: string) => CHANGE_LABELS[t] ?? t;

  readonly isTutor = computed(() => this.lesson()?.tutor.id === this.store.me()?.id);
  /** Notes belong to the lesson's tutor and student only. */
  readonly isParty = computed(() => {
    const me = this.store.me()?.id;
    const l = this.lesson();
    return !!l && (l.tutor.id === me || l.student.id === me);
  });

  readonly noteControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(20000)],
  });
  readonly reportForm = this.fb.group({
    summary: ['', [Validators.required, Validators.maxLength(4000)]],
    covered: ['', Validators.maxLength(2000)],
    nextSteps: ['', Validators.maxLength(2000)],
    engagement: this.fb.control<number | null>(null),
  });

  async ngOnInit() {
    try {
      const lesson = await this.api.lesson(this.id());
      this.lesson.set(lesson);
      const [note, report] = await Promise.all([
        this.isParty() ? this.api.note(this.id()) : Promise.resolve(null),
        this.api.report(this.id()),
      ]);
      this.note.set(note);
      this.noteControl.setValue(note?.content ?? '');
      this.report.set(report);
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }

  async saveNote() {
    this.error.set(null);
    try {
      this.note.set(await this.api.saveNote(this.id(), this.noteControl.value));
      this.flash('Notatka zapisana');
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }

  editReport() {
    const r = this.report();
    this.reportForm.setValue({
      summary: r?.summary ?? '',
      covered: r?.covered ?? '',
      nextSteps: r?.nextSteps ?? '',
      engagement: r?.engagement ?? null,
    });
    this.editingReport.set(true);
  }

  async saveReport() {
    if (this.reportForm.invalid) return this.reportForm.markAllAsTouched();
    this.error.set(null);
    try {
      this.report.set(await this.api.saveReport(this.id(), this.reportForm.getRawValue()));
      this.editingReport.set(false);
      this.flash('Raport zapisany');
    } catch (err) {
      this.error.set(applyServerErrors(this.reportForm, err));
    }
  }

  restore(content: string) {
    this.noteControl.setValue(content);
  }

  private flash(msg: string) {
    this.saved.set(msg);
    setTimeout(() => this.saved.set(null), 2500);
  }
}
