import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, type OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { RouterLink } from '@angular/router';
import {
  ATTENDANCE_LABELS,
  type BillingAccount,
  type EnrollmentDetail,
  type EnrollmentStatus,
  HOMEWORK_STATUS_LABELS,
  type HomeworkInfo,
  type LessonInfo,
  type ProgressInfo,
  type ReportInfo,
  TOPIC_STATUS_LABELS,
} from '@pl/shared';
import { toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { TeachingApi } from '../../core/teaching-api';
import { initial, personColor } from '../../shared/person-color';
import { money } from '../billing/money';
import { EVENT_LABELS, statusLabel, studentLevel } from '../labels';

type Kind = 'lesson' | 'homework' | 'assessment' | 'payment';

interface FeedItem {
  id: string;
  kind: Kind;
  at: number;
  title: string;
  body?: string;
  extra?: string;
  big?: string;
  link?: unknown[];
  action?: { label: string; link: unknown[] };
}

const KIND_LABEL: Record<Kind, string> = {
  lesson: 'Lekcje',
  homework: 'Zadania',
  assessment: 'Oceny',
  payment: 'Płatności',
};

/**
 * One cooperation as a single timeline: lessons with their reports, homework, assessments and
 * payments in order, plus the essentials on the side. Editable parts only for the tutor.
 */
@Component({
  selector: 'pl-enrollment-detail-page',
  imports: [
    MatButtonModule,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './enrollment-detail-page.html',
  styleUrl: './enrollment-detail-page.scss',
})
export default class EnrollmentDetailPage implements OnInit {
  private readonly api = inject(TeachingApi);
  private readonly store = inject(AuthStore);

  readonly id = input.required<string>();
  readonly e = signal<EnrollmentDetail | null>(null);
  readonly lessons = signal<LessonInfo[]>([]);
  readonly reports = signal<ReportInfo[]>([]);
  readonly homework = signal<HomeworkInfo[]>([]);
  readonly progress = signal<ProgressInfo | null>(null);
  readonly billing = signal<BillingAccount | null>(null);
  readonly filter = signal<Kind | 'all'>('all');
  readonly error = signal<string | null>(null);
  readonly editing = signal(false);
  readonly busy = signal(false);
  readonly showHistory = signal(false);
  readonly goals = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(2000)],
  });

  readonly kinds = Object.entries(KIND_LABEL) as [Kind, string][];
  readonly isTutor = computed(() => this.e()?.tutor.id === this.store.me()?.id);
  readonly level = studentLevel;
  readonly statusLabel = statusLabel;
  readonly eventLabel = (t: string) => EVENT_LABELS[t] ?? t;
  readonly topicLabel = TOPIC_STATUS_LABELS;
  readonly money = money;
  readonly color = personColor;
  readonly initial = initial;
  readonly backLink = computed(() => (this.isTutor() ? '/app/students' : '/app'));

  /** Progress ring: average result against 100%. */
  readonly ring = computed(() => {
    const avg = this.progress()?.summary.averagePercent ?? null;
    const c = 2 * Math.PI * 52;
    return { avg, dash: `${((avg ?? 0) / 100) * c} ${c}` };
  });

  readonly stats = computed(() => {
    const done = this.lessons().filter((l) => l.status === 'completed');
    const present = done.filter((l) => l.attendance !== 'absent').length;
    return {
      completed: done.length,
      rate: done.length ? Math.round((present / done.length) * 100) : null,
    };
  });

  readonly upcoming = computed(() =>
    this.lessons().find(
      (l) =>
        l.status === 'scheduled' && Date.parse(l.startsAt) + l.durationMin * 60_000 > Date.now(),
    ),
  );

  readonly feed = computed<FeedItem[]>(() => {
    const reportsByLesson = new Map(this.reports().map((r) => [r.lessonId, r]));
    const items: FeedItem[] = [];
    for (const l of this.lessons()) {
      if (Date.parse(l.startsAt) > Date.now()) continue;
      const r = reportsByLesson.get(l.id);
      const state =
        l.status === 'cancelled'
          ? `odwołana${l.chargeable ? ' · płatna' : ''}`
          : l.attendance
            ? ATTENDANCE_LABELS[l.attendance].toLowerCase()
            : 'do oznaczenia obecności';
      items.push({
        id: `l-${l.id}`,
        kind: 'lesson',
        at: Date.parse(l.startsAt),
        title: `Lekcja · ${state}${r ? ' · raport' : ''}`,
        body: r
          ? [r.summary, r.nextSteps && `Dalej: ${r.nextSteps}`].filter(Boolean).join(' ')
          : (l.topic ?? undefined),
        link: ['/app/lessons', l.id],
      });
    }
    for (const h of this.homework()) {
      items.push({
        id: `h-${h.id}`,
        kind: 'homework',
        at: Date.parse(h.submittedAt ?? h.createdAt),
        title: `Zadanie · ${HOMEWORK_STATUS_LABELS[h.status].toLowerCase()}`,
        body: h.title,
        extra: h.grade ? `ocena: ${h.grade}` : undefined,
        action:
          this.isTutor() && h.status === 'submitted'
            ? { label: 'Oceń', link: ['/app/homework'] }
            : !this.isTutor() && h.status === 'assigned'
              ? { label: 'Rozwiąż', link: ['/app/homework'] }
              : undefined,
      });
    }
    for (const a of this.progress()?.assessments ?? []) {
      items.push({
        id: `a-${a.id}`,
        kind: 'assessment',
        at: Date.parse(a.takenAt),
        title: 'Ocena',
        big: a.percent !== null ? `${a.percent}%` : (a.grade ?? ''),
        body: `${a.title}${a.percent !== null ? ` · ${a.score}/${a.maxScore}` : ''}${a.grade && a.percent !== null ? ` · ${a.grade}` : ''}`,
      });
    }
    for (const p of this.billing()?.entries ?? []) {
      if (p.kind !== 'payment' || p.voided) continue;
      items.push({
        id: `p-${p.id}`,
        kind: 'payment',
        at: Date.parse(p.occurredAt),
        title: 'Wpłata',
        body: p.description,
        extra: money(-p.amount),
      });
    }
    const f = this.filter();
    return items.filter((i) => f === 'all' || i.kind === f).sort((a, b) => b.at - a.at);
  });

  async ngOnInit() {
    try {
      const e = await this.api.enrollment(this.id());
      this.e.set(e);
      const day = 24 * 3600_000;
      const [lessons, reports, homework, progress, billing] = await Promise.all([
        this.api.lessons(
          new Date(Date.now() - 365 * day),
          new Date(Date.now() + 60 * day),
          this.id(),
        ),
        this.api.reports(this.id()).catch(() => []),
        this.api.homework(this.id()).catch(() => []),
        this.api.progress(this.id()).catch(() => null),
        this.api.billingAccount(this.id()).catch(() => null),
      ]);
      this.lessons.set(lessons);
      this.reports.set(reports);
      this.homework.set(homework);
      this.progress.set(progress);
      this.billing.set(billing);
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
