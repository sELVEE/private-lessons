import { DatePipe } from '@angular/common';
import {
  Component,
  computed,
  type ElementRef,
  inject,
  input,
  type OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import {
  ATTENDANCE_LABELS,
  type Availability,
  clockToMinutes,
  type EnrollmentInfo,
  LESSON_STATUS_LABELS,
  type LessonInfo,
  type OrgSettings,
  rangesForDate,
  SLOT_MINUTES,
} from '@pl/shared';
import { applyServerErrors, toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { TeachingApi } from '../../core/teaching-api';
import { initial, personColor } from '../../shared/person-color';
import { addDays, isoDay, parseIsoDay, startOfWeek, weekdayIndex } from '../../shared/time';
import { Avatar, DateTimeField, PageHeader, PeriodNav, Section } from '../../shared/ui';
import { AvailabilityEditor } from './availability-editor';

export type CalendarView = 'day' | 'week' | 'month';
type Panel = 'lesson' | 'create' | 'hours' | 'rules';

/** Pixel height of one hour in the day and week grids — taller when the working day is short. */
const hourHeight = (hours: number) => (hours <= 6 ? 96 : hours <= 9 ? 80 : 64);

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

@Component({
  selector: 'pl-calendar-page',
  imports: [
    AvailabilityEditor,
    Avatar,
    DateTimeField,
    PageHeader,
    PeriodNav,
    Section,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatChipsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatSelectModule,
    MatSidenavModule,
    MatTooltipModule,
  ],
  templateUrl: './calendar-page.html',
  styleUrl: './calendar-page.scss',
})
export default class CalendarPage implements OnInit {
  private readonly api = inject(TeachingApi);
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  /** `?new=1` opens the „new lesson” form (quick action from „Pulpit”). */
  readonly new = input<string>();
  /** `?date=YYYY-MM-DD&view=day` — e.g. a day picked on „Pulpit”. */
  readonly date = input<string>();
  readonly view = input<string>();

  private readonly gridEl = viewChild<ElementRef<HTMLElement>>('grid');

  readonly role = this.store.role;
  readonly color = personColor;
  readonly initial = initial;
  readonly isTutor = computed(() => this.role() === 'tutor');
  readonly statusLabel = LESSON_STATUS_LABELS;
  readonly attendanceLabel = ATTENDANCE_LABELS;

  readonly mode = signal<CalendarView>('week');
  readonly anchor = signal(new Date());
  readonly panel = signal<Panel | null>(null);
  readonly selectedId = signal<string | null>(null);
  readonly hiddenStudents = signal<Set<string>>(new Set());
  readonly lessons = signal<LessonInfo[]>([]);
  readonly pending = signal<LessonInfo[]>([]);
  readonly enrollments = signal<EnrollmentInfo[]>([]);
  readonly settings = signal<OrgSettings | null>(null);
  readonly hours = signal<Availability | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly editing = signal(false);
  readonly cancelling = signal(false);
  readonly now = signal(new Date());
  /** Hover hint in an empty slot: where a click would plan a lesson. */
  readonly hoverSlot = signal<{ key: string; top: number; label: string } | null>(null);

  /** First and last day (exclusive) of what is on screen. */
  readonly range = computed(() => {
    const a = new Date(this.anchor());
    a.setHours(0, 0, 0, 0);
    switch (this.mode()) {
      case 'day':
        return { from: a, to: addDays(a, 1) };
      case 'week': {
        const from = startOfWeek(a);
        return { from, to: addDays(from, 7) };
      }
      case 'month': {
        const from = startOfWeek(new Date(a.getFullYear(), a.getMonth(), 1));
        return { from, to: addDays(from, 42) };
      }
    }
  });

  readonly visibleLessons = computed(() =>
    this.lessons().filter((l) => !this.hiddenStudents().has(l.student.id)),
  );

  readonly days = computed(() => {
    const { from, to } = this.range();
    const month = this.anchor().getMonth();
    const out = [];
    for (let d = from; d < to; d = addDays(d, 1)) {
      const next = addDays(d, 1);
      out.push({
        date: d,
        key: isoDay(d),
        today: d.toDateString() === this.now().toDateString(),
        outside: this.mode() === 'month' && d.getMonth() !== month,
        lessons: this.visibleLessons().filter((l) => {
          const t = Date.parse(l.startsAt);
          return t >= d.getTime() && t < next.getTime();
        }),
        off: this.offBlocks(d),
        working: this.workingRanges(d),
      });
    }
    return out;
  });

  /**
   * Hours shown in the grid: the tutor's working hours (the whole weekly template, so free days keep
   * the same range), widened only for lessons outside them; 8–21 when no hours are set.
   */
  readonly span = computed(() => {
    let from = Infinity;
    let to = -Infinity;
    const widen = (start: number, end: number) => {
      from = Math.min(from, start);
      to = Math.max(to, end);
    };
    for (const w of this.hours()?.weekly ?? [])
      for (const r of w.ranges) widen(clockToMinutes(r.start), clockToMinutes(r.end));
    for (const d of this.days()) for (const r of d.working) widen(r.start, r.end);
    if (from === Infinity) widen(8 * 60, 21 * 60);
    for (const d of this.days())
      for (const l of d.lessons) {
        const s = minutesOf(new Date(l.startsAt));
        widen(s, s + l.durationMin);
      }
    const first = Math.floor(from / 60);
    const last = Math.min(24, Math.ceil(to / 60));
    return {
      from: first,
      to: last,
      list: Array.from({ length: last - first }, (_, i) => first + i),
    };
  });

  readonly hourPx = computed(() => hourHeight(this.span().list.length));

  readonly students = computed(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const l of this.lessons())
      seen.set(l.student.id, { id: l.student.id, name: l.student.displayName });
    return [...seen.values()];
  });
  readonly countLabel = computed(() => {
    const n = this.count();
    return `${n} ${n === 1 ? 'lekcja' : n > 1 && n < 5 ? 'lekcje' : 'lekcji'}`;
  });
  readonly count = computed(
    () => this.visibleLessons().filter((l) => l.status !== 'cancelled').length,
  );
  readonly selected = computed(
    () => this.lessons().find((l) => l.id === this.selectedId()) ?? null,
  );
  readonly activeEnrollments = computed(() =>
    this.enrollments().filter((e) => e.status === 'active'),
  );

  readonly createForm = this.fb.group({
    enrollmentId: ['', Validators.required],
    startsAt: this.fb.control<Date | null>(null, Validators.required),
    durationMin: [60, [Validators.required, Validators.min(15), Validators.max(240)]],
    repeatWeeks: [1, [Validators.min(1), Validators.max(26)]],
    location: [''],
    topic: [''],
  });
  readonly rescheduleForm = this.fb.group({
    startsAt: this.fb.control<Date | null>(null, Validators.required),
    durationMin: [60, [Validators.min(15), Validators.max(240)]],
  });
  readonly cancelReason = this.fb.control('');
  readonly settingsForm = this.fb.group({
    autoChargeLateCancellation: [false],
    cancellationWindowHours: [24, [Validators.min(1), Validators.max(168)]],
    defaultLessonMinutes: [60, [Validators.min(15), Validators.max(240)]],
    slotMinutes: [30],
  });
  readonly slotOptions = SLOT_MINUTES;
  /** „10:00, 10:15, 10:30…” — what a booking step means, as a hint. */
  slotExamples(step: number) {
    const at = (m: number) => `${10 + Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    return `${[0, step, step * 2].map(at).join(', ')}…`;
  }

  /** Booking step: lessons start every this many minutes. */
  readonly step = computed(() => this.settings()?.slotMinutes ?? 30);

  async ngOnInit() {
    const v = this.view();
    if (v === 'day' || v === 'week' || v === 'month') this.mode.set(v);
    else if (matchMedia('(max-width: 700px)').matches) this.mode.set('day');
    const d = parseIsoDay(this.date());
    if (d) this.anchor.set(d);
    setInterval(() => this.now.set(new Date()), 60_000);

    if (this.isTutor()) {
      try {
        const [enrollments, settings, hours] = await Promise.all([
          this.api.enrollments(),
          this.api.settings(),
          this.api.availability(),
        ]);
        this.enrollments.set(enrollments);
        this.settings.set(settings);
        this.hours.set(hours);
        this.settingsForm.setValue(settings);
        this.createForm.controls.durationMin.setValue(settings.defaultLessonMinutes);
      } catch (err) {
        this.error.set(toApiError(err).message);
      }
    }
    await this.load();
    if (this.new() && this.isTutor()) this.openCreate();
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  title() {
    const { from, to } = this.range();
    const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('pl-PL', o);
    switch (this.mode()) {
      case 'day':
        return fmt(from, { weekday: 'long', day: 'numeric', month: 'long' });
      case 'week': {
        const last = addDays(to, -1);
        return from.getMonth() === last.getMonth()
          ? `${from.getDate()}–${fmt(last, { day: 'numeric', month: 'long' })}`
          : `${fmt(from, { day: 'numeric', month: 'short' })} – ${fmt(last, { day: 'numeric', month: 'short' })}`;
      }
      case 'month':
        return fmt(this.anchor(), { month: 'long', year: 'numeric' });
    }
  }

  setMode(m: CalendarView) {
    this.mode.set(m);
    return this.reload();
  }

  move(dir: -1 | 1) {
    const a = new Date(this.anchor());
    if (this.mode() === 'day') a.setDate(a.getDate() + dir);
    else if (this.mode() === 'week') a.setDate(a.getDate() + 7 * dir);
    else a.setMonth(a.getMonth() + dir, 1);
    this.anchor.set(a);
    return this.reload();
  }

  today() {
    this.anchor.set(new Date());
    return this.reload();
  }

  goTo(d: Date | null) {
    if (!d) return;
    this.anchor.set(d);
    return this.reload();
  }

  /** Clicking a day (header, month cell) opens that day. */
  openDay(d: Date) {
    this.anchor.set(d);
    this.mode.set('day');
    return this.reload();
  }

  // ── Grid geometry ─────────────────────────────────────────────────────────

  top(minutes: number) {
    return ((minutes - this.span().from * 60) / 60) * this.hourPx();
  }

  lessonBox(l: LessonInfo) {
    const start = minutesOf(new Date(l.startsAt));
    return {
      top: `${this.top(start)}px`,
      height: `${Math.max(22, (l.durationMin / 60) * this.hourPx() - 3)}px`,
      '--c': this.color(l.student.id),
    };
  }

  nowTop() {
    return this.top(minutesOf(this.now()));
  }

  /** Working ranges (in minutes) on a day; empty when the tutor has no hours set at all. */
  private workingRanges(d: Date) {
    const a = this.hours();
    if (!a) return [];
    return rangesForDate(a, isoDay(d), weekdayIndex(d)).map((r) => ({
      start: clockToMinutes(r.start),
      end: clockToMinutes(r.end),
    }));
  }

  /** Greyed-out parts of a day: everything outside working hours (only when hours are set). */
  private offBlocks(d: Date): { top: number; height: number }[] {
    const a = this.hours();
    if (!a || (!a.weekly.length && !a.exceptions.length)) return [];
    const ranges = this.workingRanges(d).sort((x, y) => x.start - y.start);
    const blocks: { top: number; height: number }[] = [];
    let cursor = 0;
    for (const r of [...ranges, { start: 24 * 60, end: 24 * 60 }]) {
      if (r.start > cursor) blocks.push({ top: cursor, height: r.start - cursor });
      cursor = Math.max(cursor, r.end);
    }
    return blocks;
  }

  offStyle(b: { top: number; height: number }) {
    const { from, to } = this.span();
    const start = Math.max(b.top, from * 60);
    const end = Math.min(b.top + b.height, to * 60);
    if (end <= start) return { display: 'none' };
    return { top: `${this.top(start)}px`, height: `${((end - start) / 60) * this.hourPx()}px` };
  }

  isWorkingDay(d: { working: unknown[] }) {
    const a = this.hours();
    return !a || (!a.weekly.length && !a.exceptions.length) || d.working.length > 0;
  }

  private slotAt(ev: MouseEvent, day: Date) {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const minutes = this.span().from * 60 + ((ev.clientY - rect.top) / this.hourPx()) * 60;
    const at = new Date(day);
    at.setHours(0, Math.floor(minutes / this.step()) * this.step(), 0, 0);
    return at;
  }

  /** Click on an empty part of a day column plans a lesson at that slot (booking step). */
  planAt(ev: MouseEvent, day: Date) {
    if (!this.isTutor() || !this.activeEnrollments().length) return;
    this.openCreate(this.slotAt(ev, day));
  }

  trackHover(ev: MouseEvent, day: { date: Date; key: string }) {
    if (!this.isTutor()) return;
    if ((ev.target as HTMLElement).closest('.lesson')) return this.hoverSlot.set(null);
    const at = this.slotAt(ev, day.date);
    this.hoverSlot.set({
      key: day.key,
      top: this.top(minutesOf(at)),
      label: at.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
    });
  }

  toggleStudent(id: string) {
    const next = new Set(this.hiddenStudents());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.hiddenStudents.set(next);
  }

  // ── Side panel ────────────────────────────────────────────────────────────

  select(l: LessonInfo) {
    this.selectedId.set(l.id);
    this.editing.set(false);
    this.cancelling.set(false);
    this.panel.set('lesson');
  }

  closePanel() {
    this.panel.set(null);
  }

  openCreate(at?: Date) {
    this.createForm.patchValue({ startsAt: at ?? this.defaultStart() });
    if (!this.createForm.value.enrollmentId && this.activeEnrollments()[0]) {
      this.createForm.patchValue({ enrollmentId: this.activeEnrollments()[0]!.id });
    }
    this.panel.set('create');
  }

  /**
   * Without a clicked slot: the first day on screen that is still ahead (or tomorrow), at the start
   * of that day's working hours (16:00 when none are set).
   */
  private defaultStart(): Date {
    const tomorrow = addDays(new Date(new Date().toDateString()), 1);
    const shown = this.range().from;
    const day = shown > tomorrow ? new Date(shown) : tomorrow;
    const first = this.workingRanges(day)[0]?.start ?? 16 * 60;
    day.setHours(0, Math.ceil(first / this.step()) * this.step(), 0, 0);
    return day;
  }

  create() {
    if (this.createForm.invalid) return this.createForm.markAllAsTouched();
    const v = this.createForm.getRawValue();
    return this.run(async () => {
      const created = await this.api.createLesson({
        enrollmentId: v.enrollmentId,
        startsAt: v.startsAt!.toISOString(),
        durationMin: Number(v.durationMin),
        repeatWeeks: Number(v.repeatWeeks),
        location: v.location || undefined,
        topic: v.topic || undefined,
      });
      this.createForm.patchValue({ location: '', topic: '', repeatWeeks: 1 });
      this.anchor.set(v.startsAt!);
      this.panel.set(null);
      if (created[0]) this.selectedId.set(created[0].id);
    }, this.createForm);
  }

  startReschedule(l: LessonInfo) {
    this.cancelling.set(false);
    this.rescheduleForm.setValue({
      startsAt: new Date(l.startsAt),
      durationMin: l.durationMin,
    });
    this.editing.set(true);
  }

  reschedule(l: LessonInfo) {
    if (this.rescheduleForm.invalid) return this.rescheduleForm.markAllAsTouched();
    const v = this.rescheduleForm.getRawValue();
    return this.run(async () => {
      await this.api.rescheduleLesson(l.id, v.startsAt!.toISOString(), Number(v.durationMin));
      this.editing.set(false);
    });
  }

  startCancel() {
    this.editing.set(false);
    this.cancelReason.setValue('');
    this.cancelling.set(true);
  }

  cancel(l: LessonInfo) {
    return this.run(async () => {
      await this.api.cancelLesson(l.id, this.cancelReason.value || undefined);
      this.cancelling.set(false);
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
          slotMinutes: v.slotMinutes,
        }),
      );
      this.panel.set(null);
    }, this.settingsForm);
  }

  isPast(l: LessonInfo) {
    return Date.parse(l.startsAt) <= Date.now();
  }

  endTime(l: LessonInfo) {
    return new Date(Date.parse(l.startsAt) + l.durationMin * 60_000);
  }

  who(l: LessonInfo) {
    return this.isTutor() || this.role() === 'parent' ? l.student.displayName : l.tutor.displayName;
  }

  lessonLabel(l: LessonInfo) {
    const t = (d: Date) => d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    return `${t(new Date(l.startsAt))}–${t(this.endTime(l))}, ${this.who(l)}, ${l.subject}, ${this.statusLabel[l.status]}`;
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

  /** Keeps the URL in step with the view, so reload and „back” return to the same place. */
  private reload() {
    void this.router.navigate([], {
      queryParams: { date: isoDay(this.anchor()), view: this.mode(), new: null },
      replaceUrl: true,
    });
    return this.load();
  }

  private async load() {
    const { from, to } = this.range();
    try {
      this.lessons.set(await this.api.lessons(from, to));
      if (this.isTutor()) {
        const recent = await this.api.lessons(addDays(new Date(), -90), addDays(new Date(), 8));
        this.pending.set(recent.filter((l) => l.status === 'cancelled' && l.chargeable === null));
      }
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
    setTimeout(() => this.scrollToWork());
  }

  /** Scrolls the grid so the working day (or the first lesson) starts at the top. */
  private scrollToWork() {
    const el = this.gridEl()?.nativeElement;
    if (!el) return;
    let first = Infinity;
    for (const d of this.days()) {
      for (const r of d.working) first = Math.min(first, r.start);
      for (const l of d.lessons) first = Math.min(first, minutesOf(new Date(l.startsAt)));
    }
    if (first === Infinity) first = 14 * 60;
    el.scrollTop = Math.max(0, this.top(first) - 24);
  }
}
