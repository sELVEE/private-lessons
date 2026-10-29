import { Component, forwardRef, input } from '@angular/core';
import {
  type AbstractControl,
  type ControlValueAccessor,
  FormControl,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
  type ValidationErrors,
  type Validator,
} from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTimepickerModule } from '@angular/material/timepicker';

const valid = (d: Date | null): d is Date => !!d && !Number.isNaN(d.getTime());

/**
 * Dzień (datepicker) i godzina (timepicker) Material składane w jedną wartość `Date`.
 * `step` to krok rezerwacji w minutach: lista godzin pokazuje tylko takie, inne są błędem.
 */
@Component({
  selector: 'pl-date-time-field',
  imports: [
    ReactiveFormsModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatTimepickerModule,
  ],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateTimeField), multi: true },
    { provide: NG_VALIDATORS, useExisting: forwardRef(() => DateTimeField), multi: true },
  ],
  template: `
    <mat-form-field>
      <mat-label>{{ label() }}</mat-label>
      <input matInput [matDatepicker]="dp" [formControl]="day" (blur)="onTouched()" />
      <mat-datepicker-toggle matIconSuffix [for]="dp" />
      <mat-datepicker #dp />
    </mat-form-field>
    <mat-form-field>
      <mat-label>Godzina</mat-label>
      <input matInput [matTimepicker]="tp" [formControl]="time" (blur)="onTouched()" />
      <mat-timepicker-toggle matIconSuffix [for]="tp" />
      <mat-timepicker #tp [interval]="step() + 'm'" />
      @if (time.hasError('offSlot')) {
        <mat-error>Wybierz godzinę co {{ step() }} min</mat-error>
      } @else {
        <mat-hint>co {{ step() }} min</mat-hint>
      }
    </mat-form-field>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
      align-items: start;
      gap: var(--pl-space-md);
    }
  `,
})
export class DateTimeField implements ControlValueAccessor, Validator {
  readonly label = input('Data');
  readonly step = input(30);

  readonly day = new FormControl<Date | null>(null);
  readonly time = new FormControl<Date | null>(null, (c) =>
    valid(c.value) && !this.fits(c.value) ? { offSlot: true } : null,
  );
  private onChange: (v: Date | null) => void = () => {};
  onTouched: () => void = () => {};

  constructor() {
    this.day.valueChanges.subscribe(() => this.emit());
    this.time.valueChanges.subscribe(() => this.emit());
  }

  writeValue(v: Date | null): void {
    this.day.setValue(v, { emitEvent: false });
    this.time.setValue(v, { emitEvent: false });
    this.time.updateValueAndValidity({ emitEvent: false });
  }
  registerOnChange(fn: (v: Date | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    for (const c of [this.day, this.time]) {
      if (disabled) c.disable({ emitEvent: false });
      else c.enable({ emitEvent: false });
    }
  }

  validate(c: AbstractControl<Date | null>): ValidationErrors | null {
    const v = c.value;
    if (!v) return null;
    if (!valid(v)) return { invalidDate: true };
    return this.fits(v) ? null : { offSlot: this.step() };
  }

  /** The day from the datepicker, the time of day from the timepicker. */
  private emit() {
    const d = this.day.value;
    const t = this.time.value;
    if (!valid(d) || !valid(t)) return this.onChange(null);
    this.onChange(
      new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.getHours(), t.getMinutes()),
    );
  }

  private fits(v: Date) {
    return v.getMinutes() % this.step() === 0;
  }
}
