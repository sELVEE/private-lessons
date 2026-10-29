import { DatePipe } from '@angular/common';
import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { EnrollmentInfo, MaterialInfo, SubjectInfo } from '@pl/shared';
import { applyServerErrors, toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { TeachingApi } from '../../core/teaching-api';
import { Markdown } from '../../shared/markdown';

/** Tutor: library by subject and topic, editor with live preview, sharing. Student/parent: shared items. */
@Component({
  selector: 'pl-materials-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    Markdown,
  ],
  templateUrl: './materials-page.html',
  styleUrl: './materials-page.scss',
})
export default class MaterialsPage implements OnInit {
  private readonly api = inject(TeachingApi);
  private readonly store = inject(AuthStore);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly isTutor = computed(() => this.store.role() === 'tutor');

  readonly materials = signal<MaterialInfo[]>([]);
  readonly subjects = signal<SubjectInfo[]>([]);
  readonly enrollments = signal<EnrollmentInfo[]>([]);
  readonly filterSubject = signal<string>('');
  readonly selected = signal<MaterialInfo | null>(null);
  readonly editing = signal<'new' | 'edit' | null>(null);
  readonly sharing = signal(false);
  readonly shareSelection = signal<Set<string>>(new Set());
  readonly error = signal<string | null>(null);

  readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(2)]],
    subjectId: ['', Validators.required],
    topicId: this.fb.control<string | null>(null),
    body: [''],
  });
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });
  readonly preview = computed(() => this.formValue().body ?? '');
  readonly topics = computed(
    () => this.subjects().find((s) => s.id === this.formValue().subjectId)?.topics ?? [],
  );
  readonly visible = computed(() => {
    const f = this.filterSubject();
    return f ? this.materials().filter((m) => m.subject.id === f) : this.materials();
  });
  readonly activeEnrollments = computed(() =>
    this.enrollments().filter((e) => e.status === 'active'),
  );

  async ngOnInit() {
    try {
      if (this.isTutor()) {
        const [subjects, enrollments] = await Promise.all([
          this.api.subjects(),
          this.api.enrollments(),
        ]);
        this.subjects.set(subjects);
        this.enrollments.set(enrollments);
      }
      await this.reload();
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }

  /** Clicking the open material again closes it. */
  open(m: MaterialInfo) {
    this.selected.set(this.selected()?.id === m.id && !this.editing() ? null : m);
    this.editing.set(null);
    this.sharing.set(false);
  }

  startNew() {
    this.selected.set(null);
    this.form.reset({
      title: '',
      subjectId: this.filterSubject() || this.subjects()[0]?.id || '',
      topicId: null,
      body: '',
    });
    this.editing.set('new');
  }

  startEdit(m: MaterialInfo) {
    this.form.reset({
      title: m.title,
      subjectId: m.subject.id,
      topicId: m.topic?.id ?? null,
      body: m.body,
    });
    this.editing.set('edit');
  }

  async save() {
    if (this.form.invalid) return this.form.markAllAsTouched();
    this.error.set(null);
    try {
      const v = this.form.getRawValue();
      const current = this.selected();
      const saved =
        this.editing() === 'edit' && current
          ? await this.api.updateMaterial(current.id, v)
          : await this.api.createMaterial(v);
      this.editing.set(null);
      await this.reload();
      this.selected.set(saved);
    } catch (err) {
      this.error.set(applyServerErrors(this.form, err));
    }
  }

  async remove(m: MaterialInfo) {
    if (!confirm(`Usunąć „${m.title}”?`)) return;
    try {
      await this.api.deleteMaterial(m.id);
      this.selected.set(null);
      await this.reload();
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }

  startShare(m: MaterialInfo) {
    this.shareSelection.set(new Set(m.sharedWith));
    this.sharing.set(true);
  }

  toggleShare(id: string, on: boolean) {
    const next = new Set(this.shareSelection());
    if (on) next.add(id);
    else next.delete(id);
    this.shareSelection.set(next);
  }

  async saveShare(m: MaterialInfo) {
    try {
      const updated = await this.api.shareMaterial(m.id, [...this.shareSelection()]);
      this.sharing.set(false);
      this.selected.set(updated);
      await this.reload();
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }

  sharedNames(m: MaterialInfo) {
    return this.enrollments()
      .filter((e) => m.sharedWith.includes(e.id))
      .map((e) => e.student.displayName)
      .join(', ');
  }

  private async reload() {
    this.materials.set(await this.api.materials());
  }
}
