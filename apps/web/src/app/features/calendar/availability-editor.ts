import { DatePipe } from '@angular/common';
import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTimepickerModule } from '@angular/material/timepicker';
import { MatTooltipModule } from '@angular/material/tooltip';
import { type Availability, type TimeRange, WEEKDAY_LABELS } from '@pl/shared';
import { toApiError } from '../../core/api-error';
import { TeachingApi } from '../../core/teaching-api';
import { isoDay, parseIsoDay } from '../../shared/time';

/** A range as the timepicker sees it (Dates; only the time of day matters). */
interface UiRange {
  start: Date;
  end: Date;
}

interface DayRow {
  weekday: number;
  on: boolean;
  ranges: UiRange[];
}

const DEFAULT_RANGE: TimeRange = { start: '15:00', end: '20:00' };

/** Godziny pracy: szablon tygodnia i wyjątki na wybrane dni. */
@Component({
  selector: 'pl-availability-editor',
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatTimepickerModule,
    MatTooltipModule,
  ],
  template: `
    <h3>Zwykły tydzień</h3>
    <p class="muted">Poza tymi godzinami kalendarz jest wyszarzony.</p>
    <div class="week">
      @for (d of rows(); track d.weekday) {
        <div class="day" [class.off]="!d.on">
          <mat-checkbox [checked]="d.on" (change)="toggle(d.weekday, $event.checked)">
            {{ labels[d.weekday] }}
          </mat-checkbox>
          @if (d.on) {
            <div class="ranges">
              @for (r of d.ranges; track $index; let i = $index) {
                <span class="range">
                  <mat-form-field
                    appearance="outline"
                    subscriptSizing="dynamic"
                    class="time pl-compact-field"
                  >
                    <input
                      matInput
                      [matTimepicker]="from"
                      [ngModel]="r.start"
                      (ngModelChange)="setTime(d.weekday, i, 'start', $event)"
                      [attr.aria-label]="labels[d.weekday] + ', od'"
                    />
                    <mat-timepicker #from interval="30m" />
                  </mat-form-field>
                  –
                  <mat-form-field
                    appearance="outline"
                    subscriptSizing="dynamic"
                    class="time pl-compact-field"
                  >
                    <input
                      matInput
                      [matTimepicker]="to"
                      [ngModel]="r.end"
                      (ngModelChange)="setTime(d.weekday, i, 'end', $event)"
                      [attr.aria-label]="labels[d.weekday] + ', do'"
                    />
                    <mat-timepicker #to interval="30m" />
                  </mat-form-field>
                  @if (d.ranges.length > 1) {
                    <button
                      matIconButton
                      type="button"
                      (click)="removeRange(d.weekday, i)"
                      matTooltip="Usuń przedział"
                    >
                      <mat-icon fontSet="material-symbols-outlined">close</mat-icon>
                    </button>
                  }
                </span>
              }
              <button
                matIconButton
                type="button"
                (click)="addRange(d.weekday)"
                matTooltip="Dodaj przerwę / drugi przedział"
              >
                <mat-icon fontSet="material-symbols-outlined">add</mat-icon>
              </button>
            </div>
          } @else {
            <span class="muted">wolne</span>
          }
        </div>
      }
    </div>
    <div class="quick">
      <button matButton type="button" (click)="copyMonday(5)">Poniedziałek → pn–pt</button>
      <button matButton type="button" (click)="copyMonday(7)">Poniedziałek → cały tydzień</button>
    </div>
    <div class="row-actions">
      <span class="muted">{{ savedNote() }}</span>
      <button matButton="filled" type="button" (click)="saveWeek()" [disabled]="busy()">
        Zapisz tydzień
      </button>
    </div>

    <h3>Wyjątki</h3>
    <p class="muted">
      Inne godziny albo wolne w wybrany dzień — mają pierwszeństwo przed tygodniem.
    </p>
    @for (e of value()?.exceptions ?? []; track e.date) {
      <div class="exception">
        <span>
          <strong>{{ e.date | date: 'EEE d MMMM' }}</strong>
          · {{ e.ranges.length ? rangesText(e.ranges) : 'wolne' }}
          @if (e.note) {
            <span class="muted">— {{ e.note }}</span>
          }
        </span>
        <button
          matIconButton
          type="button"
          (click)="removeException(e.date)"
          matTooltip="Usuń wyjątek"
        >
          <mat-icon fontSet="material-symbols-outlined">delete</mat-icon>
        </button>
      </div>
    } @empty {
      <p class="muted">Brak wyjątków.</p>
    }
    <div class="add">
      <mat-form-field appearance="outline">
        <mat-label>Dzień</mat-label>
        <input matInput [matDatepicker]="dp" [(ngModel)]="exDate" [min]="today" />
        <mat-datepicker-toggle matIconSuffix [for]="dp" />
        <mat-datepicker #dp />
      </mat-form-field>
      <mat-checkbox [(ngModel)]="exOff">Wolne cały dzień</mat-checkbox>
      @if (!exOff) {
        <span class="range">
          <mat-form-field
            appearance="outline"
            subscriptSizing="dynamic"
            class="time pl-compact-field"
          >
            <mat-label>Od</mat-label>
            <input matInput [matTimepicker]="exFrom" [(ngModel)]="exStart" />
            <mat-timepicker #exFrom interval="30m" />
          </mat-form-field>
          –
          <mat-form-field
            appearance="outline"
            subscriptSizing="dynamic"
            class="time pl-compact-field"
          >
            <mat-label>Do</mat-label>
            <input matInput [matTimepicker]="exTo" [(ngModel)]="exEnd" />
            <mat-timepicker #exTo interval="30m" />
          </mat-form-field>
        </span>
      }
      <mat-form-field appearance="outline">
        <mat-label>Notatka (opcjonalnie)</mat-label>
        <input matInput [(ngModel)]="exNote" maxlength="120" />
      </mat-form-field>
      <button
        matButton="outlined"
        type="button"
        (click)="addException()"
        [disabled]="busy() || !exDate"
      >
        Dodaj wyjątek
      </button>
    </div>
    @if (error(); as e) {
      <div class="error-banner" role="alert">{{ e }}</div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    h3 {
      margin: 20px 0 2px;
      font-size: 18px;
    }
    .week {
      display: flex;
      flex-direction: column;
      margin: 8px 0;
    }
    .day {
      display: grid;
      grid-template-columns: 136px minmax(0, 1fr);
      align-items: center;
      gap: 8px;
      min-height: 48px;
      border-bottom: 1px solid var(--pl-line);
      padding: 6px 0;
      mat-checkbox {
        min-width: 0;
      }
    }
    .ranges {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
    }
    .range {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .time {
      width: 84px;
    }
    .quick {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 8px;
    }
    .exception {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 4px 0;
      border-bottom: 1px solid var(--pl-line);
    }
    .add {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      margin-top: 12px;
      mat-form-field {
        flex: 1 1 180px;
      }
    }
  `,
})
export class AvailabilityEditor {
  private readonly api = inject(TeachingApi);

  readonly value = input<Availability | null>(null);
  /** Day suggested for a new exception (the one shown in the calendar). */
  readonly suggestedDate = input<string | null>(null);
  readonly changed = output<Availability>();

  readonly labels = WEEKDAY_LABELS;
  readonly today = new Date();
  readonly rows = signal<DayRow[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly savedNote = signal('');

  exDate: Date | null = null;
  exOff = true;
  exStart: Date | null = this.toDate(DEFAULT_RANGE.start);
  exEnd: Date | null = this.toDate(DEFAULT_RANGE.end);
  exNote = '';

  constructor() {
    effect(() => {
      const a = this.value();
      this.rows.set(
        Array.from({ length: 7 }, (_, weekday) => {
          const ranges = a?.weekly.find((d) => d.weekday === weekday)?.ranges ?? [];
          return {
            weekday,
            on: ranges.length > 0,
            ranges: (ranges.length ? ranges : [DEFAULT_RANGE]).map((r) => this.toUi(r)),
          };
        }),
      );
    });
    effect(() => {
      const d = parseIsoDay(this.suggestedDate());
      if (d && d >= new Date(new Date().toDateString())) this.exDate = d;
    });
  }

  rangesText(rs: TimeRange[]) {
    return rs.map((r) => `${r.start}–${r.end}`).join(', ');
  }

  toggle(weekday: number, on: boolean) {
    this.update(weekday, (d) => ({ ...d, on }));
  }

  /** „HH:MM” → today's Date at that time (the timepicker works with Dates). */
  toDate(v: string): Date {
    const [h, m] = v.split(':').map(Number);
    const d = new Date();
    d.setHours(h!, m!, 0, 0);
    return d;
  }

  toClock(d: Date | null): string | null {
    if (!d || Number.isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  private toUi(r: TimeRange): UiRange {
    return { start: this.toDate(r.start), end: this.toDate(r.end) };
  }

  setTime(weekday: number, i: number, field: 'start' | 'end', value: Date | null) {
    const v = value;
    const current = this.rows().find((d) => d.weekday === weekday)?.ranges[i]?.[field] ?? null;
    if (!v || !this.toClock(v) || this.toClock(v) === this.toClock(current)) return;
    this.update(weekday, (d) => ({
      ...d,
      ranges: d.ranges.map((r, j) => (j === i ? { ...r, [field]: v } : r)),
    }));
  }

  addRange(weekday: number) {
    this.update(weekday, (d) => {
      const h = d.ranges.at(-1)!.end.getHours();
      const start = `${String(Math.min(h + 1, 22)).padStart(2, '0')}:00`;
      const end = `${String(Math.min(h + 2, 23)).padStart(2, '0')}:00`;
      return { ...d, ranges: [...d.ranges, this.toUi({ start, end })] };
    });
  }

  removeRange(weekday: number, i: number) {
    this.update(weekday, (d) => ({ ...d, ranges: d.ranges.filter((_, j) => j !== i) }));
  }

  /** Copies Monday's hours to the first `days` days of the week. */
  copyMonday(days: number) {
    const mon = this.rows()[0]!;
    this.rows.update((rows) =>
      rows.map((d) =>
        d.weekday < days
          ? {
              ...d,
              on: mon.on,
              ranges: mon.ranges.map((r) => ({ start: new Date(r.start), end: new Date(r.end) })),
            }
          : d,
      ),
    );
    this.savedNote.set('Niezapisane zmiany');
  }

  async saveWeek() {
    await this.act(async () => {
      const days = this.rows()
        .filter((d) => d.on)
        .map((d) => ({
          weekday: d.weekday,
          ranges: d.ranges.map((r) => ({
            start: this.toClock(r.start)!,
            end: this.toClock(r.end)!,
          })),
        }));
      this.changed.emit(await this.api.saveWeeklyHours({ days }));
      this.savedNote.set('Zapisano');
    });
  }

  async addException() {
    if (!this.exDate) return;
    const start = this.toClock(this.exStart);
    const end = this.toClock(this.exEnd);
    if (!this.exOff && (!start || !end)) {
      this.error.set('Podaj godziny od–do albo zaznacz „Wolne cały dzień”.');
      return;
    }
    const ranges = this.exOff ? [] : [{ start: start!, end: end! }];
    await this.act(async () => {
      this.changed.emit(
        await this.api.saveException(isoDay(this.exDate!), ranges, this.exNote || undefined),
      );
      this.exNote = '';
    });
  }

  async removeException(date: string) {
    await this.act(async () => this.changed.emit(await this.api.removeException(date)));
  }

  private update(weekday: number, fn: (d: DayRow) => DayRow) {
    this.rows.update((rows) => rows.map((d) => (d.weekday === weekday ? fn(d) : d)));
    this.savedNote.set('Niezapisane zmiany');
  }

  private async act(fn: () => Promise<void>) {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.busy.set(false);
    }
  }
}
