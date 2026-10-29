import { Clipboard } from '@angular/cdk/clipboard';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import type { EnrollmentInfo, EnrollmentStatus, InviteInfo, SubjectInfo } from '@pl/shared';
import { applyServerErrors, toApiError } from '../../core/api-error';
import { personColor } from '../../shared/person-color';
import { TeachingApi } from '../../core/teaching-api';
import { statusLabel, studentLevel } from '../labels';

@Component({
  selector: 'pl-students-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  templateUrl: './students-page.html',
  styleUrl: './students-page.scss',
})
export default class StudentsPage implements OnInit {
  private readonly api = inject(TeachingApi);
  private readonly clipboard = inject(Clipboard);
  private readonly snack = inject(MatSnackBar);
  private readonly fb = inject(NonNullableFormBuilder);

  /** `?invite=1` (szybka akcja z ekranu „Teraz”) otwiera panel zaproszenia. */
  readonly invite = input<string>();

  readonly color = personColor;
  readonly level = studentLevel;
  readonly statusLabel = statusLabel;

  readonly enrollments = signal<EnrollmentInfo[]>([]);
  readonly invites = signal<InviteInfo[]>([]);
  readonly subjects = signal<SubjectInfo[]>([]);
  readonly filter = signal<EnrollmentStatus | 'all'>('active');
  readonly showInvite = signal(false);
  readonly created = signal<InviteInfo | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly loaded = signal(false);

  readonly visible = computed(() => {
    const f = this.filter();
    return f === 'all' ? this.enrollments() : this.enrollments().filter((e) => e.status === f);
  });
  readonly counts = computed(() => {
    const all = this.enrollments();
    return { active: all.filter((e) => e.status === 'active').length, all: all.length };
  });

  readonly inviteForm = this.fb.group({
    subjectId: ['', Validators.required],
    mode: this.fb.control<'code' | 'email'>('code'),
    email: ['', Validators.email],
    maxUses: [1, [Validators.min(1), Validators.max(50)]],
    expiresInDays: [7, [Validators.min(1), Validators.max(30)]],
  });

  async ngOnInit() {
    try {
      const [enrollments, invites, subjects] = await Promise.all([
        this.api.enrollments(),
        this.api.invites(),
        this.api.subjects(),
      ]);
      this.enrollments.set(enrollments);
      this.invites.set(invites);
      this.subjects.set(subjects);
      if (subjects[0]) this.inviteForm.controls.subjectId.setValue(subjects[0].id);
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loaded.set(true);
    }
    if (this.invite()) this.openInvite();
  }

  openInvite() {
    this.created.set(null);
    this.showInvite.set(true);
  }

  async createInvite() {
    const v = this.inviteForm.getRawValue();
    if (v.mode === 'email' && !v.email) {
      this.inviteForm.controls.email.setErrors({ required: true });
    }
    if (this.inviteForm.invalid) return this.inviteForm.markAllAsTouched();
    this.busy.set(true);
    this.error.set(null);
    try {
      const invite = await this.api.createInvite({
        subjectId: v.subjectId,
        expiresInDays: v.expiresInDays,
        ...(v.mode === 'email' ? { email: v.email } : { maxUses: v.maxUses }),
      });
      this.invites.set(await this.api.invites());
      if (v.mode === 'email') {
        this.snack.open(`Wysłano zaproszenie na ${v.email}`, 'OK', { duration: 4000 });
        this.showInvite.set(false);
        this.inviteForm.controls.email.reset();
      } else {
        this.created.set(invite);
      }
    } catch (err) {
      this.error.set(applyServerErrors(this.inviteForm, err));
    } finally {
      this.busy.set(false);
    }
  }

  copy(text: string, what: string) {
    this.clipboard.copy(text);
    this.snack.open(`Skopiowano ${what}`, undefined, { duration: 2000 });
  }

  async revoke(invite: InviteInfo) {
    try {
      await this.api.revokeInvite(invite.id);
      this.invites.update((list) => list.filter((i) => i.id !== invite.id));
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }
}
