import { Component, computed, inject, input, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import type {
  BalanceRow,
  ChildInfo,
  EnrollmentInfo,
  HomeworkInfo,
  LessonInfo,
  ProgressSummary,
  ReportInfo,
} from '@pl/shared';
import { toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { TeachingApi } from '../../core/teaching-api';
import { initial, personColor } from '../../shared/person-color';
import { addDays, dayLabel, relativeTime, startOfWeek, timeLabel, isoDay } from '../../shared/time';
import { money } from '../billing/money';

interface InboxItem {
  id: string;
  kind: 'charge' | 'homework' | 'debt';
  title: string;
  detail: string;
  lesson?: LessonInfo;
  homework?: HomeworkInfo;
  balance?: BalanceRow;
}

interface QuickAction {
  label: string;
  link: string;
  params?: Record<string, string>;
}

const QUICK: Record<string, QuickAction[]> = {
  tutor: [
    { label: 'Zaplanuj lekcję', link: '/app/calendar', params: { new: '1' } },
    { label: 'Zapisz wpłatę', link: '/app/billing' },
    { label: 'Zadaj zadanie', link: '/app/homework', params: { new: '1' } },
    { label: 'Zaproś ucznia', link: '/app/students', params: { invite: '1' } },
  ],
  student: [
    { label: 'Moje zadania', link: '/app/homework' },
    { label: 'Materiały', link: '/app/materials' },
    { label: 'Dołącz z kodem', link: '/app/join' },
  ],
  parent: [
    { label: 'Dzieci', link: '/app/children' },
    { label: 'Płatności', link: '/app/billing' },
  ],
  admin: [{ label: 'Administracja', link: '/app/admin' }],
};

/**
 * „Teraz”: what do I want to do, what is happening next, what is waiting for me.
 * One screen for every role; the data and actions differ.
 */
@Component({
  selector: 'pl-home-page',
  imports: [MatButtonModule, FormsModule, MatIconModule, RouterLink],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export default class HomePage implements OnInit {
  private readonly store = inject(AuthStore);
  private readonly api = inject(TeachingApi);
  private readonly router = inject(Router);

  readonly joined = input<string>();
  readonly me = this.store.me;
  readonly role = this.store.role;
  readonly quick = computed(() => QUICK[this.role() ?? 'admin'] ?? []);
  readonly time = timeLabel;
  readonly day = dayLabel;
  readonly color = personColor;
  readonly initial = initial;
  readonly money = money;

  readonly lessons = signal<LessonInfo[]>([]);
  readonly enrollments = signal<EnrollmentInfo[]>([]);
  readonly homework = signal<HomeworkInfo[]>([]);
  readonly inbox = signal<InboxItem[]>([]);
  readonly children = signal<ChildInfo[]>([]);
  readonly nextSummary = signal<ProgressSummary | null>(null);
  readonly lastReport = signal<ReportInfo | null>(null);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly query = signal('');

  readonly greeting = computed(() => {
    const h = new Date().getHours();
    const name = this.me()?.displayName ?? '';
    return `${h < 12 ? 'Dzień dobry' : h < 18 ? 'Cześć' : 'Dobry wieczór'}, ${name}.`;
  });

  /** The next lesson that has not finished yet. */
  readonly next = computed(() =>
    this.lessons().find(
      (l) =>
        l.status === 'scheduled' && Date.parse(l.startsAt) + l.durationMin * 60_000 > Date.now(),
    ),
  );
  readonly nextIn = computed(() => {
    const n = this.next();
    return n ? relativeTime(n.startsAt) : '';
  });
  readonly nextHomework = computed(() => {
    const n = this.next();
    return n
      ? this.homework().find((h) => h.enrollmentId === n.enrollmentId && h.status !== 'reviewed')
      : undefined;
  });

  readonly week = computed(() => {
    const start = startOfWeek(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      const lessons = this.lessons().filter(
        (l) =>
          new Date(l.startsAt).toDateString() === date.toDateString() && l.status !== 'cancelled',
      );
      return {
        date,
        key: isoDay(date),
        label: date.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric' }),
        today: date.toDateString() === new Date().toDateString(),
        lessons,
      };
    });
  });
  readonly weekCount = computed(() => this.week().reduce((s, d) => s + d.lessons.length, 0));
  readonly freeDays = computed(() => this.week().filter((d) => !d.lessons.length).length);

  readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (q.length < 2) return [];
    return this.enrollments()
      .filter((e) =>
        `${e.student.displayName} ${e.tutor.displayName} ${e.subject.name}`
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 5);
  });

  readonly studentTodo = computed(() => this.homework().filter((h) => h.status === 'assigned'));

  async ngOnInit() {
    const role = this.role();
    if (role === 'admin') return;
    try {
      const weekStart = startOfWeek(new Date());
      const [lessons, enrollments, homework] = await Promise.all([
        this.api.lessons(weekStart, addDays(weekStart, 14)),
        this.api.enrollments(),
        this.api.homework(),
      ]);
      this.lessons.set(lessons);
      this.enrollments.set(enrollments);
      this.homework.set(homework);
      if (role === 'tutor') await this.loadInbox(homework);
      if (role === 'parent') this.children.set(await this.api.children());
      await this.loadNextContext();
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }

  submitQuery() {
    const first = this.matches()[0];
    if (first)
      void this.router.navigate([
        this.role() === 'tutor' ? '/app/students' : '/app/cooperation',
        first.id,
      ]);
  }

  openEnrollment(e: EnrollmentInfo) {
    return this.router.navigate([
      this.role() === 'tutor' ? '/app/students' : '/app/cooperation',
      e.id,
    ]);
  }

  async decide(item: InboxItem, chargeable: boolean) {
    await this.act(async () => {
      await this.api.decideCharge(item.lesson!.id, chargeable);
      this.inbox.update((list) => list.filter((i) => i !== item));
    });
  }

  async remind(item: InboxItem) {
    await this.act(async () => {
      const r = await this.api.remind(item.balance!.enrollmentId);
      this.info.set(`Wysłano przypomnienie (${r.sent} ${r.sent === 1 ? 'adres' : 'adresy'}).`);
      this.inbox.update((list) => list.filter((i) => i !== item));
    });
  }

  private async loadInbox(homework: HomeworkInfo[]) {
    const now = Date.now();
    const [recent, balances] = await Promise.all([
      this.api.lessons(new Date(now - 90 * 24 * 3600_000), new Date(now + 8 * 24 * 3600_000)),
      this.api.balances(),
    ]);
    const items: InboxItem[] = [
      ...recent
        .filter((l) => l.status === 'cancelled' && l.chargeable === null)
        .map((l) => ({
          id: `c-${l.id}`,
          kind: 'charge' as const,
          title: `Późne odwołanie — ${l.student.displayName}`,
          detail: `${dayLabel(l.startsAt)} ${timeLabel(l.startsAt)}${l.cancelReason ? ` · „${l.cancelReason}”` : ''} · płatna?`,
          lesson: l,
        })),
      ...homework
        .filter((h) => h.status === 'submitted')
        .map((h) => ({
          id: `h-${h.id}`,
          kind: 'homework' as const,
          title: `Zadanie do sprawdzenia — ${h.student}`,
          detail: h.title,
          homework: h,
        })),
      ...balances
        .filter((b) => b.balance > 0)
        .map((b) => ({
          id: `d-${b.enrollmentId}`,
          kind: 'debt' as const,
          title: `Zaległość — ${b.student}`,
          detail: `${money(b.balance)} · ${b.subject}`,
          balance: b,
        })),
    ];
    this.inbox.set(items);
  }

  private async loadNextContext() {
    const n = this.next();
    if (!n) return;
    const [progress, reports] = await Promise.all([
      this.api.progress(n.enrollmentId).catch(() => null),
      this.api.reports(n.enrollmentId).catch(() => []),
    ]);
    this.nextSummary.set(progress?.summary ?? null);
    this.lastReport.set(reports[0] ?? null);
  }

  private async act(fn: () => Promise<void>) {
    this.error.set(null);
    this.info.set(null);
    try {
      await fn();
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }
}
