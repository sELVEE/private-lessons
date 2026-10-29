import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import {
  ATTENDANCE_LABELS,
  type EnrollmentInfo,
  LESSON_STATUS_LABELS,
  type LessonInfo,
  type OrgSettings,
} from '@pl/shared';
import { applyServerErrors, toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { TeachingApi } from '../../core/teaching-api';
import { initial, personColor } from '../../shared/person-color';

const DAY_MS = 24 * 3600_000;

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  return x;
}

/** `<input type="datetime-local">` value for a Date, in local time. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

@Component({
  selector: 'pl-calendar-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatSelectModule,
  ],
  templateUrl: './calendar-page.html',
  styleUrl: './calendar-page.scss',
})
export default class CalendarPage implements OnInit {
  private readonly api = inject(TeachingApi);
  private readonly store = inject(AuthStore);
  private readonly fb = inject(NonNullableFormBuilder);

  /** `?new=1` opens the „new lesson” form (quick action from „Teraz”). */
  readonly new = input<string>();
  readonly role = this.store.role;
  readonly color = personColor;
  readonly initial = initial;
  readonly selectedId = signal<string | null>(null);
  readonly hiddenStudents = signal<Set<string>>(new Set());
  readonly isTutor = computed(() => this.role() === 'tutor');
  readonly statusLabel = LESSON_STATUS_LABELS;
  readonly attendanceLabel = ATTENDANCE_LABELS;

  readonly weekStart = signal(startOfWeek(new Date()));
  readonly lessons = signal<LessonInfo[]>([]);
  readonly pending = signal<LessonInfo[]>([]);
  readonly enrollments = signal<EnrollmentInfo[]>([]);
  readonly settings = signal<OrgSettings | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly showCreate = signal(false);
  readonly showSettings = signal(false);
  readonly editing = signal<string | null>(null);
  readonly cancelling = signal<string | null>(null);

  readonly days = computed(() => {
    const start = this.weekStart().getTime();
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(start + i * DAY_MS);
      const next = date.getTime() + DAY_MS;
      return {
        date,
        today: new Date().toDateString() === date.toDateString(),
        lessons: this.lessons().filter((l) => {
          const t = Date.parse(l.startsAt);
          return t >= date.getTime() && t < next && !this.hiddenStudents().has(l.student.id);
        }),
      };
    });
  });
  readonly activeEnrollments = computed(() =>
    this.enrollments().filter((e) => e.status === 'active'),
  );

  /** Visible hours on the lanes: 8–21, widened when a lesson falls outside. */
  readonly hours = computed(() => {
    let from = 8;
    let to = 21;
    for (const l of this.lessons()) {
      const d = new Date(l.startsAt);
      from = Math.min(from, d.getHours());
      to = Math.max(to, Math.ceil(d.getHours() + d.getMinutes() / 60 + l.durationMin / 60));
    }
    return { from, to, list: Array.from({ length: to - from }, (_, i) => from + i) };
  });
  readonly students = computed(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const l of this.lessons())
      seen.set(l.student.id, { id: l.student.id, name: l.student.displayName });
    return [...seen.values()];
  });
  readonly weekCount = computed(
    () => this.lessons().filter((l) => l.status !== 'cancelled').length,
  );
  readonly selected = computed(() => {
    const all = this.lessons();
    const id = this.selectedId();
    return (
      all.find((l) => l.id === id) ??
      all.find(
        (l) =>
          l.status === 'scheduled' && Date.parse(l.startsAt) + l.durationMin * 60_000 > Date.now(),
      ) ??
      null
    );
  });
  readonly nowLeft = computed(() => this.pos(new Date()));

  readonly createForm = this.fb.group({
    enrollmentId: ['', Validators.required],
    startsAt: ['', Validators.required],
    durationMin: [60, [Validators.required, Validators.min(15), Validators.max(240)]],
    repeatWeeks: [1, [Validators.min(1), Validators.max(26)]],
    location: [''],
    topic: [''],
  });
  readonly rescheduleForm = this.fb.group({
    startsAt: ['', Validators.required],
    durationMin: [60, [Validators.min(15), Validators.max(240)]],
  });
  readonly cancelReason = this.fb.control('');
  readonly settingsForm = this.fb.group({
    autoChargeLateCancellation: [false],
    cancellationWindowHours: [24, [Validators.min(1), Validators.max(168)]],
    defaultLessonMinutes: [60, [Validators.min(15), Validators.max(240)]],
  });

  async ngOnInit() {
    if (this.isTutor()) {
      try {
        const [enrollments, settings] = await Promise.all([
          this.api.enrollments(),
          this.api.settings(),
        ]);
        this.enrollments.set(enrollments);
        this.settings.set(settings);
        this.settingsForm.setValue(settings);
        this.createForm.controls.durationMin.setValue(settings.defaultLessonMinutes);
      } catch (err) {
        this.error.set(toApiError(err).message);
      }
    }
    await this.load();
    if (this.new() && this.isTutor()) this.openCreate();
  }

  /** Horizontal position (%) of a moment on the lane. */
  pos(d: Date): number {
    const { from, to } = this.hours();
    const h = d.getHours() + d.getMinutes() / 60;
    return Math.max(0, Math.min(100, ((h - from) / (to - from)) * 100));
  }

  pillStyle(l: LessonInfo) {
    const { from, to } = this.hours();
    const start = this.pos(new Date(l.startsAt));
    const width = (l.durationMin / 60 / (to - from)) * 100;
    return {
      left: `${start}%`,
      width: `${width}%`,
      ...(l.status === 'cancelled' ? {} : { background: this.color(l.student.id) }),
    };
  }

  /** Gaps of at least two hours between 14:00 and the end of the lane — when lessons usually happen. */
  freeSlots(lessons: LessonInfo[]): { left: number; width: number; label: string }[] {
    const { to } = this.hours();
    const busy = lessons
      .filter((l) => l.status !== 'cancelled')
      .map((l) => {
        const d = new Date(l.startsAt);
        const s = d.getHours() + d.getMinutes() / 60;
        return [s, s + l.durationMin / 60] as const;
      })
      .sort((a, b) => a[0] - b[0]);
    const slots: { left: number; width: number; label: string }[] = [];
    let cursor = 14;
    for (const [s, e] of [...busy, [to, to] as const]) {
      if (s - cursor >= 2) {
        const { from } = this.hours();
        const span = to - from;
        slots.push({
          left: ((cursor - from) / span) * 100,
          width: ((s - cursor) / span) * 100,
          label: `wolne ${Math.ceil(cursor)}–${Math.floor(s)}`,
        });
      }
      cursor = Math.max(cursor, e);
    }
    return slots;
  }

  isToday(d: Date) {
    return d.toDateString() === new Date().toDateString();
  }

  toggleStudent(id: string) {
    const next = new Set(this.hiddenStudents());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.hiddenStudents.set(next);
  }

  select(l: LessonInfo) {
    this.selectedId.set(l.id);
    this.editing.set(null);
    this.cancelling.set(null);
  }

  move(weeks: number) {
    this.weekStart.set(new Date(this.weekStart().getTime() + weeks * 7 * DAY_MS));
    return this.load();
  }

  today() {
    this.weekStart.set(startOfWeek(new Date()));
    return this.load();
  }

  openCreate(day?: Date) {
    const at = new Date(day ?? Date.now() + DAY_MS);
    at.setHours(16, 0, 0, 0);
    this.createForm.patchValue({ startsAt: toLocalInput(at) });
    if (!this.createForm.value.enrollmentId && this.activeEnrollments()[0]) {
      this.createForm.patchValue({ enrollmentId: this.activeEnrollments()[0]!.id });
    }
    this.showCreate.set(true);
  }

  create() {
    if (this.createForm.invalid) return this.createForm.markAllAsTouched();
    const v = this.createForm.getRawValue();
    return this.run(async () => {
      await this.api.createLesson({
        enrollmentId: v.enrollmentId,
        startsAt: new Date(v.startsAt).toISOString(),
        durationMin: Number(v.durationMin),
        repeatWeeks: Number(v.repeatWeeks),
        location: v.location || undefined,
        topic: v.topic || undefined,
      });
      this.showCreate.set(false);
      this.createForm.patchValue({ location: '', topic: '', repeatWeeks: 1 });
    }, this.createForm);
  }

  startReschedule(l: LessonInfo) {
    this.cancelling.set(null);
    this.rescheduleForm.setValue({
      startsAt: toLocalInput(new Date(l.startsAt)),
      durationMin: l.durationMin,
    });
    this.editing.set(l.id);
  }

  reschedule(l: LessonInfo) {
    const v = this.rescheduleForm.getRawValue();
    return this.run(async () => {
      await this.api.rescheduleLesson(
        l.id,
        new Date(v.startsAt).toISOString(),
        Number(v.durationMin),
      );
      this.editing.set(null);
    });
  }

  startCancel(l: LessonInfo) {
    this.editing.set(null);
    this.cancelReason.setValue('');
    this.cancelling.set(l.id);
  }

  cancel(l: LessonInfo) {
    return this.run(async () => {
      await this.api.cancelLesson(l.id, this.cancelReason.value || undefined);
      this.cancelling.set(null);
    });
  }

  complete(l: LessonInfo, attendance: 'present' | 'late' | 'absent') {
    return this.run(() => this.api.completeLesson(l.id, attendance));
  }

  decide(l: LessonInfo, chargeable: boolean) {
    return this.run(() => this.api.decideCharge(l.id, chargeable));
  }

  saveSettings() {
    if (this.settingsForm.invalid) return;
    const v = this.settingsForm.getRawValue();
    return this.run(async () => {
      this.settings.set(
        await this.api.saveSettings({
          autoChargeLateCancellation: v.autoChargeLateCancellation,
          cancellationWindowHours: Number(v.cancellationWindowHours),
          defaultLessonMinutes: Number(v.defaultLessonMinutes),
        }),
      );
      this.showSettings.set(false);
    }, this.settingsForm);
  }

  isPast(l: LessonInfo) {
    return Date.parse(l.startsAt) <= Date.now();
  }

  endTime(l: LessonInfo) {
    return new Date(Date.parse(l.startsAt) + l.durationMin * 60_000);
  }

  private async run(fn: () => Promise<unknown>, form?: Parameters<typeof applyServerErrors>[0]) {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
      await this.load();
    } catch (err) {
      this.error.set(form ? applyServerErrors(form, err) : toApiError(err).message);
    } finally {
      this.busy.set(false);
    }
  }

  private async load() {
    const from = this.weekStart();
    const to = new Date(from.getTime() + 7 * DAY_MS);
    try {
      this.lessons.set(await this.api.lessons(from, to));
      if (this.isTutor()) {
        const recent = await this.api.lessons(
          new Date(Date.now() - 90 * DAY_MS),
          new Date(Date.now() + 8 * DAY_MS),
        );
        this.pending.set(recent.filter((l) => l.status === 'cancelled' && l.chargeable === null));
      }
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }
}
