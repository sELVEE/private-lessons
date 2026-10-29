import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { RouterLink } from '@angular/router';
import type { BalanceRow, EarningsSummary } from '@pl/shared';
import { toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { TeachingApi } from '../../core/teaching-api';
import { currentMonth, money, monthLabel, shiftMonth } from './money';

/** Tutor: monthly earnings and per-student balances. Student/parent: own balances. */
@Component({
  selector: 'pl-billing-page',
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatListModule, RouterLink],
  templateUrl: './billing-page.html',
  styleUrl: './billing-page.scss',
})
export default class BillingPage implements OnInit {
  private readonly api = inject(TeachingApi);
  readonly store = inject(AuthStore);
  readonly isTutor = computed(() => this.store.role() === 'tutor');
  readonly money = money;
  readonly monthLabel = monthLabel;

  readonly month = signal(currentMonth());
  readonly summary = signal<EarningsSummary | null>(null);
  readonly rows = signal<BalanceRow[]>([]);
  readonly error = signal<string | null>(null);
  readonly maxBar = computed(() =>
    Math.max(1, ...(this.summary()?.history ?? []).map((h) => Math.max(h.received, h.charged))),
  );

  ngOnInit() {
    return this.load();
  }

  move(delta: number) {
    this.month.set(shiftMonth(this.month(), delta));
    return this.load();
  }

  barHeight(v: number) {
    return `${Math.round((v / this.maxBar()) * 100)}%`;
  }

  private async load() {
    this.error.set(null);
    try {
      if (this.isTutor()) {
        const s = await this.api.earnings(this.month());
        this.summary.set(s);
        this.rows.set(s.rows);
      } else {
        this.rows.set(await this.api.balances());
      }
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }
}
