import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  type AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import {
  type AccountType,
  ageRange,
  DIGITAL_CONSENT_AGE,
  needsParentConsent,
  PASSWORD_MIN_LENGTH,
  registerSchema,
  SCHOOL_LEVEL_LABELS,
  SCHOOL_LEVEL_MAX_GRADE,
  SCHOOL_LEVELS,
  type SchoolLevel,
} from '@pl/shared';
import { firstValueFrom, startWith } from 'rxjs';
import { applyServerErrors } from '../../core/api-error';

const CURRENT_YEAR = new Date().getFullYear();

@Component({
  selector: 'pl-register-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  templateUrl: './register-page.html',
  styles: `
    .type-toggle {
      width: 100%;
      margin-bottom: var(--pl-space-lg);
    }
    .type-toggle mat-button-toggle {
      flex: 1;
    }
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 var(--pl-space-md);
    }
    fieldset {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      padding: var(--pl-space-md) var(--pl-space-md) 0;
      margin: 0 0 var(--pl-space-lg);
    }
    legend {
      padding: 0 var(--pl-space-xs);
      color: var(--mat-sys-on-surface-variant);
    }
    mat-checkbox {
      display: block;
      margin-bottom: var(--pl-space-sm);
    }
    .check-error {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
      margin: -4px 0 var(--pl-space-sm) var(--pl-space-md);
    }
  `,
})
export default class RegisterPage {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly levels = SCHOOL_LEVELS.map((value) => ({ value, label: SCHOOL_LEVEL_LABELS[value] }));
  readonly passwordMin = PASSWORD_MIN_LENGTH;
  readonly consentAge = DIGITAL_CONSENT_AGE;
  readonly maxBirthYear = CURRENT_YEAR - 5;

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly done = signal<{ email: string; parentEmail?: string } | null>(null);
  readonly hidePassword = signal(true);

  readonly form = this.fb.group({
    accountType: this.fb.control<AccountType>('student'),
    displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]],
    email: ['', [Validators.required, Validators.email]],
    username: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(32),
        Validators.pattern(/^[a-zA-Z0-9._-]+$/),
      ],
    ],
    password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]],
    passwordRepeat: ['', [Validators.required]],
    declaresAdult: [false],
    acceptTerms: [false, [Validators.requiredTrue]],
    student: this.fb.group({
      schoolLevel: this.fb.control<SchoolLevel | ''>('', Validators.required),
      grade: this.fb.control<number | null>(null),
      birthYear: this.fb.control<number | null>(null, [
        Validators.required,
        Validators.min(CURRENT_YEAR - 100),
        Validators.max(CURRENT_YEAR - 5),
      ]),
      isAtLeast16: [false],
      parentEmail: ['', [Validators.email]],
    }),
  });

  private readonly value = toSignal(this.form.valueChanges.pipe(startWith(this.form.value)), {
    initialValue: this.form.value,
  });

  readonly accountType = computed(() => this.value().accountType ?? 'student');
  readonly isStudent = computed(() => this.accountType() === 'student');

  readonly grades = computed(() => {
    const level = this.value().student?.schoolLevel;
    const max = level ? SCHOOL_LEVEL_MAX_GRADE[level] : null;
    return max ? Array.from({ length: max }, (_, i) => i + 1) : [];
  });

  private readonly birthYear = computed(() => {
    const y = Number(this.value().student?.birthYear);
    return Number.isInteger(y) && y > CURRENT_YEAR - 100 && y <= this.maxBirthYear ? y : null;
  });

  /** In the one ambiguous birth year we ask the student whether they are already 16. */
  readonly askAtLeast16 = computed(() => {
    const y = this.birthYear();
    if (y === null) return false;
    const [youngest, oldest] = ageRange(y);
    return youngest < DIGITAL_CONSENT_AGE && oldest >= DIGITAL_CONSENT_AGE;
  });

  readonly needsParent = computed(() => {
    const y = this.birthYear();
    return (
      this.isStudent() &&
      y !== null &&
      needsParentConsent(y, this.value().student?.isAtLeast16 ?? false)
    );
  });

  constructor() {
    // Student-only fields are validated only when relevant.
    this.form.controls.accountType.valueChanges.subscribe((type) => {
      const student = this.form.controls.student;
      if (type === 'student') student.enable({ emitEvent: false });
      else student.disable({ emitEvent: false });
    });
    this.form.controls.student.controls.schoolLevel.valueChanges.subscribe(() =>
      this.form.controls.student.controls.grade.setValue(null),
    );
  }

  setType(type: AccountType) {
    this.form.controls.accountType.setValue(type);
  }

  async submit() {
    if (this.busy()) return;
    this.error.set(null);
    const v = this.form.getRawValue();
    if (v.password !== v.passwordRepeat) {
      this.form.controls.passwordRepeat.setErrors({ mismatch: true });
    }

    const payload = {
      accountType: v.accountType,
      displayName: v.displayName,
      email: v.email,
      username: v.username,
      password: v.password,
      acceptTerms: v.acceptTerms,
      ...(v.accountType === 'student'
        ? {
            student: {
              schoolLevel: v.student.schoolLevel || undefined,
              grade: v.student.grade ?? undefined,
              birthYear: v.student.birthYear === null ? undefined : Number(v.student.birthYear),
              isAtLeast16: this.askAtLeast16() ? v.student.isAtLeast16 : undefined,
              parentEmail: this.needsParent() ? v.student.parentEmail || undefined : undefined,
            },
          }
        : { declaresAdult: v.declaresAdult }),
    };

    // Same Zod schema the API uses — instant feedback, the server validates again anyway.
    const parsed = registerSchema.safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        this.markError(this.form.get(issue.path.join('.')), issue.message);
    }
    if (!parsed.success || this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Popraw zaznaczone pola');
      return;
    }

    this.busy.set(true);
    try {
      await firstValueFrom(this.http.post('/api/auth/register', parsed.data));
      this.done.set({ email: parsed.data.email, parentEmail: parsed.data.student?.parentEmail });
    } catch (err) {
      this.error.set(applyServerErrors(this.form, err));
    } finally {
      this.busy.set(false);
    }
  }

  private markError(control: AbstractControl | null, message: string) {
    if (!control) return;
    control.setErrors({ ...control.errors, server: message });
    control.markAsTouched();
  }
}
