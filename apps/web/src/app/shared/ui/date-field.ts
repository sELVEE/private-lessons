import { Component, forwardRef, input } from '@angular/core';
import {
  type ControlValueAccessor,
  FormControl,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { isoDay, parseIsoDay } from '../time';

/** Pole daty (Material datepicker) dla formularzy przechowujących dzień jako `YYYY-MM-DD`. */
@Component({
  selector: 'pl-date-field',
  imports: [ReactiveFormsModule, MatDatepickerModule, MatFormFieldModule, MatInputModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateField), multi: true },
  ],
  template: `
    <mat-form-field>
      <mat-label>{{ label() }}</mat-label>
      <input matInput [matDatepicker]="dp" [formControl]="ctrl" (blur)="onTouched()" />
      <mat-datepicker-toggle matIconSuffix [for]="dp" />
      <mat-datepicker #dp />
    </mat-form-field>
  `,
  styles: `
    :host {
      display: block;
    }
    mat-form-field {
      width: 100%;
    }
  `,
})
export class DateField implements ControlValueAccessor {
  readonly label = input('Data');

  readonly ctrl = new FormControl<Date | null>(null);
  private onChange: (v: string) => void = () => {};
  onTouched: () => void = () => {};

  constructor() {
    this.ctrl.valueChanges.subscribe((d) =>
      this.onChange(d && !Number.isNaN(d.getTime()) ? isoDay(d) : ''),
    );
  }

  writeValue(v: string | null): void {
    this.ctrl.setValue(parseIsoDay(v), { emitEvent: false });
  }
  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    if (disabled) this.ctrl.disable({ emitEvent: false });
    else this.ctrl.enable({ emitEvent: false });
  }
}
