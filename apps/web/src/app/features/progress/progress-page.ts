import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import {
  ASSESSMENT_KIND_LABELS,
  ASSESSMENT_KINDS,
  type AssessmentKind,
  type ProgressInfo,
  TOPIC_STATUS_LABELS,
  TOPIC_STATUSES,
  type TopicStatus,
} from '@pl/shared';
import { applyServerErrors, toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { TeachingApi } from '../../core/teaching-api';

const W = 600;
const H = 180;
const PAD = 24;

@Component({
  selector: 'pl-progress-page',
  imports: [
    MatTooltipModule,
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './progress-page.html',
  styleUrl: './progress-page.scss',
})
export default class ProgressPage implements OnInit {
  private readonly api = inject(TeachingApi);
  private readonly store = inject(AuthStore);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly id = input.required<string>();
  readonly p = signal<ProgressInfo | null>(null);
  readonly days = signal(30);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);
  readonly showAssessment = signal(false);

  readonly isTutor = computed(() => this.store.role() === 'tutor');
  readonly kinds = ASSESSMENT_KINDS.map((k) => ({ value: k, label: ASSESSMENT_KIND_LABELS[k] }));
  readonly kindLabel = ASSESSMENT_KIND_LABELS;
  readonly statuses = TOPIC_STATUSES.map((s) => ({ value: s, label: TOPIC_STATUS_LABELS[s] }));
  readonly statusLabel = TOPIC_STATUS_LABELS;
  readonly tagClass: Record<string, string> = { mastered: 'good', review: 'warn' };

  readonly assessmentForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(2)]],
    kind: this.fb.control<AssessmentKind>('test'),
    score: [''],
    maxScore: [''],
    grade: [''],
    takenAt: [new Date().toISOString().slice(0, 10), Validators.required],
    topicId: this.fb.control<string | null>(null),
  });
  readonly goalForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(2)]],
    targetDate: [''],
  });

  /** Percent results over time, as an SVG polyline (oldest → newest). */
  readonly chart = computed(() => {
    const pts = [...(this.p()?.assessments ?? [])].filter((a) => a.percent !== null).reverse();
    if (pts.length < 2) return null;
    const t0 = Date.parse(pts[0]!.takenAt);
    const t1 = Date.parse(pts.at(-1)!.takenAt);
    const span = Math.max(t1 - t0, 1);
    const coords = pts.map((a) => ({
      x: PAD + ((Date.parse(a.takenAt) - t0) / span) * (W - 2 * PAD),
      y: H - PAD - (a.percent! / 100) * (H - 2 * PAD),
      label: `${a.title}: ${a.percent}% · ${new Date(a.takenAt).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}`,
    }));
    return { w: W, h: H, pad: PAD, points: coords.map((c) => `${c.x},${c.y}`).join(' '), coords };
  });

  async ngOnInit() {
    await this.load();
  }

  setDays(d: number) {
    this.days.set(d);
    return this.load();
  }

  async addAssessment() {
    if (this.assessmentForm.invalid) return this.assessmentForm.markAllAsTouched();
    const v = this.assessmentForm.getRawValue();
    const num = (x: string) => (x === '' ? null : Number(x.replace(',', '.')));
    try {
      this.p.set(
        await this.api.addAssessment(this.id(), {
          title: v.title,
          kind: v.kind,
          score: num(v.score),
          maxScore: num(v.maxScore),
          grade: v.grade || null,
          takenAt: v.takenAt,
          topicId: v.topicId,
        }),
      );
      this.assessmentForm.patchValue({ title: '', score: '', maxScore: '', grade: '' });
      this.showAssessment.set(false);
      await this.load();
    } catch (err) {
      this.error.set(applyServerErrors(this.assessmentForm, err));
    }
  }

  async removeAssessment(id: string) {
    if (!confirm('Usunąć ocenę?')) return;
    await this.run(() => this.api.removeAssessment(id));
  }

  async setTopic(topicId: string, status: TopicStatus | null) {
    await this.run(() => this.api.setTopicStatus(this.id(), topicId, status));
  }

  async addGoal() {
    if (this.goalForm.invalid) return;
    const v = this.goalForm.getRawValue();
    await this.run(async () => {
      await this.api.addGoal(this.id(), v.title, v.targetDate || null);
      this.goalForm.reset();
    });
  }

  async toggleGoal(id: string, achieved: boolean) {
    await this.run(() => this.api.setGoal(id, achieved));
  }

  async removeGoal(id: string) {
    await this.run(() => this.api.removeGoal(id));
  }

  async send() {
    await this.run(async () => {
      const r = await this.api.sendSummary(this.id(), this.days());
      this.info.set(`Wysłano podsumowanie do ${r.sent} ${r.sent === 1 ? 'osoby' : 'osób'}.`);
    });
  }

  private async run(fn: () => Promise<unknown>) {
    this.error.set(null);
    this.info.set(null);
    try {
      await fn();
      await this.load();
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }

  private async load() {
    try {
      this.p.set(await this.api.progress(this.id(), this.days()));
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }
}
