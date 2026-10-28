import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, type OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { RouterLink } from '@angular/router';
import type { ChildInfo, EnrollmentInfo } from '@pl/shared';
import { AuthStore } from '../../core/auth.store';
import { TeachingApi } from '../../core/teaching-api';
import { studentLevel } from '../labels';

/** Role-specific dashboard. Lesson, homework and billing widgets arrive with their stages. */
@Component({
  selector: 'pl-home-page',
  imports: [DatePipe, MatButtonModule, MatCardModule, MatIconModule, MatListModule, RouterLink],
  templateUrl: './home-page.html',
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
      align-items: start;
    }
    .big {
      font: var(--mat-sys-display-small);
      margin: 0;
    }
  `,
})
export default class HomePage implements OnInit {
  private readonly store = inject(AuthStore);
  private readonly api = inject(TeachingApi);
  readonly me = this.store.me;
  readonly role = this.store.role;
  readonly joined = input<string>();
  readonly level = studentLevel;

  readonly enrollments = signal<EnrollmentInfo[]>([]);
  readonly children = signal<ChildInfo[]>([]);
  readonly active = computed(() => this.enrollments().filter((e) => e.status === 'active'));
  readonly schoolLabel = computed(() => {
    const s = this.me()?.student;
    return s ? studentLevel(s) : '';
  });

  async ngOnInit() {
    const role = this.role();
    try {
      if (role === 'tutor' || role === 'student')
        this.enrollments.set(await this.api.enrollments());
      if (role === 'parent') this.children.set(await this.api.children());
    } catch {
      // Widgets stay empty; each page shows its own errors.
    }
  }
}
