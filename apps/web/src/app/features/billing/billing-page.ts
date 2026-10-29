import { DatePipe } from '@angular/common';
import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import {
  type BalanceRow,
  type EarningsSummary,
  type LedgerRow,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from '@pl/shared';
import { toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { TeachingApi } from '../../core/teaching-api';
import { initial, personColor } from '../../shared/person-color';
import { currentMonth, money, monthLabel, shiftMonth } from './money';

/** „Pieniądze”: the month in one sentence, who owes what with one-click actions, then the ledger. */
@Component({
  selector: 'pl-billing-page',
  imports: [DatePipe, MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule, RouterLink],
  templateUrl: './billing-page.html',
  styleUrl: './billing-page.scss',
})
export default class BillingPage implements OnInit {
  private readonly api = inject(TeachingApi);
  readonly store = inject(AuthStore);
  readonly isTutor = computed(() => this.store.role() === 'tutor');
  readonly money = money;
  readonly monthLabel = monthLabel;
  readonly color = personColor;
  readonly initial = initial;
  readonly methods = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => ({
    value: m,
    label: PAYMENT_METHOD_LABELS[m],
  }));

  readonly month = signal(currentMonth());
  readonly summary = signal<EarningsSummary | null>(null);
  readonly rows = signal<BalanceRow[]>([]);
  readonly ledger = signal<LedgerRow[]>([]);
  readonly showAll = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);

  readonly owing = computed(() =>
    [...this.rows()].filter((r) => r.balance > 0).sort((a, b) => b.balance - a.balance),
  );
  readonly settled = computed(() => this.rows().filter((r) => r.balance <= 0));
  readonly visibleLedger = computed(() =>
    this.showAll() ? this.ledger() : this.ledger().slice(0, 8),
  );
  readonly maxBar = computed(() =>
    Math.max(1, ...(this.summary()?.history ?? []).map((h) => h.received)),
  );
  readonly bestMonth = computed(() => {
    const h = this.summary()?.history ?? [];
    const cur = h.at(-1);
    return !!cur && cur.received > 0 && h.every((x) => x.received <= cur.received);
  });
  readonly isCurrentMonth = computed(() => this.month() === currentMonth());

  ngOnInit() {
    return this.load();
  }

  move(delta: number) {
    this.month.set(shiftMonth(this.month(), delta));
    this.showAll.set(false);
    return this.load();
  }

  barHeight(v: number) {
    return `${Math.max(4, Math.round((v / this.maxBar()) * 100))}%`;
  }

  shortMonth(m: string) {
    return monthLabel(m).slice(0, 3);
  }

  async remind(r: BalanceRow) {
    await this.act(async () => {
      const res = await this.api.remind(r.enrollmentId);
      this.info.set(`Wysłano przypomnienie do: ${r.student}${res.sent > 1 ? ' i rodziców' : ''}.`);
    });
  }

  /** „Zapłacone”: records a payment of the whole outstanding balance. */
  async paid(r: BalanceRow, method: PaymentMethod) {
    await this.act(async () => {
      await this.api.addPayment(r.enrollmentId, r.balance, method);
      this.info.set(`Zapisano wpłatę ${money(r.balance)} — ${r.student}.`);
      await this.load();
    });
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

  private async load() {
    this.error.set(null);
    try {
      if (this.isTutor()) {
        const [s, ledger] = await Promise.all([
          this.api.earnings(this.month()),
          this.api.ledger(this.month()),
        ]);
        this.summary.set(s);
        this.rows.set(s.rows);
        this.ledger.set(ledger);
      } else {
        this.rows.set(await this.api.balances());
      }
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }
}
