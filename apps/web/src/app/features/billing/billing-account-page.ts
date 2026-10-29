import { DatePipe, Location } from '@angular/common';
import { Component, computed, inject, input, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  type BillingAccount,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type PaymentMethod,
  type Statement,
} from '@pl/shared';
import { toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { TeachingApi } from '../../core/teaching-api';
import { currentMonth, money, monthLabel, shiftMonth, toGrosze } from './money';

@Component({
  selector: 'pl-billing-account-page',
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
  ],
  templateUrl: './billing-account-page.html',
  styleUrl: './billing-account-page.scss',
})
export default class BillingAccountPage implements OnInit {
  private readonly api = inject(TeachingApi);
  private readonly store = inject(AuthStore);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly location = inject(Location);

  readonly id = input.required<string>();
  readonly acc = signal<BillingAccount | null>(null);
  readonly statement = signal<Statement | null>(null);
  readonly month = signal(currentMonth());
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly panel = signal<'payment' | 'package' | 'adjustment' | 'rate' | null>(null);

  readonly isTutor = computed(() => this.store.role() === 'tutor');
  readonly money = money;
  readonly monthLabel = monthLabel;
  readonly methods = PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }));

  readonly paymentForm = this.fb.group({
    amount: ['', Validators.required],
    method: this.fb.control<PaymentMethod>('transfer'),
    paidAt: [new Date().toISOString().slice(0, 10)],
    note: [''],
  });
  readonly packageForm = this.fb.group({
    lessons: [10, [Validators.required, Validators.min(1), Validators.max(100)]],
    price: ['', Validators.required],
    note: [''],
  });
  readonly adjustmentForm = this.fb.group({
    direction: this.fb.control<'up' | 'down'>('down'),
    amount: ['', Validators.required],
    note: ['', [Validators.required, Validators.minLength(3)]],
  });
  readonly rateForm = this.fb.group({ rate: ['', Validators.required] });

  async ngOnInit() {
    await this.reload();
  }

  open(p: 'payment' | 'package' | 'adjustment' | 'rate') {
    if (p === 'rate') {
      const r = this.acc()?.hourlyRate;
      this.rateForm.setValue({ rate: r === null || r === undefined ? '' : String(r / 100) });
    }
    this.panel.set(this.panel() === p ? null : p);
  }

  saveRate() {
    const v = toGrosze(this.rateForm.getRawValue().rate);
    if (v === null || v < 0) return this.invalid();
    return this.run(() => this.api.setRate(this.id(), v));
  }

  savePayment() {
    const f = this.paymentForm.getRawValue();
    const amount = toGrosze(f.amount);
    if (!amount || amount <= 0) return this.invalid();
    const paidAt = f.paidAt ? new Date(`${f.paidAt}T12:00:00`).toISOString() : undefined;
    return this.run(async () => {
      await this.api.addPayment(this.id(), amount, f.method, paidAt, f.note || undefined);
      this.paymentForm.patchValue({ amount: '', note: '' });
    });
  }

  savePackage() {
    const f = this.packageForm.getRawValue();
    const price = toGrosze(f.price);
    if (!price || price <= 0 || this.packageForm.invalid) return this.invalid();
    return this.run(() =>
      this.api.addPackage(this.id(), Number(f.lessons), price, f.note || undefined),
    );
  }

  saveAdjustment() {
    const f = this.adjustmentForm.getRawValue();
    const amount = toGrosze(f.amount);
    if (!amount || amount <= 0 || this.adjustmentForm.invalid) return this.invalid();
    return this.run(() =>
      this.api.addAdjustment(this.id(), f.direction === 'up' ? amount : -amount, f.note),
    );
  }

  voidEntry(id: string) {
    if (!confirm('Anulować ten wpis? Pozostanie w historii jako anulowany.')) return;
    return this.run(() => this.api.voidEntry(id));
  }

  moveMonth(delta: number) {
    this.month.set(shiftMonth(this.month(), delta));
    return this.loadStatement();
  }

  print() {
    window.print();
  }

  private invalid() {
    this.error.set('Podaj poprawną kwotę, np. 120 lub 120,50');
  }

  private async run(fn: () => Promise<unknown>) {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
      this.panel.set(null);
      await this.reload();
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.busy.set(false);
    }
  }

  private async reload() {
    try {
      this.acc.set(await this.api.billingAccount(this.id()));
      await this.loadStatement();
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }

  private async loadStatement() {
    this.statement.set(await this.api.statement(this.id(), this.month()));
  }
}
