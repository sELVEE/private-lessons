import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import type { AdminUserRow } from '@pl/shared';
import { applyServerErrors, toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';
import { TeachingApi } from '../../core/teaching-api';

const TYPE_LABEL: Record<string, string> = {
  tutor: 'Korepetytor',
  student: 'Uczeń',
  parent: 'Rodzic',
};
const STATUS_LABEL: Record<AdminUserRow['status'], string> = {
  active: 'Aktywne',
  locked: 'Zablokowane',
  disabled: 'Wyłączone',
};

/** Account lookup and locking only. Every search is logged with its reason. */
@Component({
  selector: 'pl-admin-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
  ],
  template: `
    <div class="page">
      <h1>Administracja — konta</h1>
      <p class="muted">
        Administrator nie ma wglądu w lekcje, notatki ani płatności. Każde wyszukiwanie i zmiana
        statusu trafia do dziennika audytu razem z podanym powodem.
      </p>
      @if (error(); as e) {
        <div class="error-banner" role="alert">{{ e }}</div>
      }
      <form [formGroup]="form" (ngSubmit)="search()" class="search">
        <mat-form-field>
          <mat-label>E-mail, login lub imię</mat-label>
          <input matInput formControlName="q" />
        </mat-form-field>
        <mat-form-field class="reason">
          <mat-label>Powód (do audytu)</mat-label>
          <input
            matInput
            formControlName="reason"
            placeholder="np. zgłoszenie #123: brak dostępu"
          />
          <mat-error>{{
            form.controls.reason.errors?.['server'] ?? 'Podaj powód (min. 5 znaków)'
          }}</mat-error>
        </mat-form-field>
        <button mat-flat-button type="submit" [disabled]="busy()">Szukaj</button>
      </form>

      @if (rows().length) {
        <div class="table-wrap">
          <table mat-table [dataSource]="rows()">
            <ng-container matColumnDef="user">
              <th mat-header-cell *matHeaderCellDef>Konto</th>
              <td mat-cell *matCellDef="let u">
                <strong>{{ u.displayName }}</strong> ({{ u.username }})<br />
                <span class="muted">{{ u.email }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="type">
              <th mat-header-cell *matHeaderCellDef>Typ</th>
              <td mat-cell *matCellDef="let u">{{ typeLabel(u) }}</td>
            </ng-container>
            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let u">
                {{ statusLabel(u.status) }}{{ u.mfaEnabled ? ' · MFA' : '' }}
              </td>
            </ng-container>
            <ng-container matColumnDef="created">
              <th mat-header-cell *matHeaderCellDef>Założone</th>
              <td mat-cell *matCellDef="let u">{{ u.createdAt | date: 'd.MM.yyyy' }}</td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef></th>
              <td mat-cell *matCellDef="let u">
                @if (u.id === meId()) {
                  <span class="muted">to Ty</span>
                } @else if (u.status === 'active') {
                  <button mat-button (click)="setStatus(u, 'locked')">Zablokuj</button>
                } @else {
                  <button mat-button (click)="setStatus(u, 'active')">Odblokuj</button>
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns"></tr>
          </table>
        </div>
      } @else if (searched()) {
        <p class="muted">Brak wyników.</p>
      }
    </div>
  `,
  styles: `
    .search {
      display: flex;
      gap: 12px;
      align-items: baseline;
      flex-wrap: wrap;
    }
    .reason {
      flex: 1;
      min-width: 260px;
    }
    .table-wrap {
      overflow-x: auto;
    }
  `,
})
export default class AdminPage {
  private readonly api = inject(TeachingApi);
  readonly form = inject(NonNullableFormBuilder).group({
    q: [''],
    reason: ['', [Validators.required, Validators.minLength(5)]],
  });
  readonly rows = signal<AdminUserRow[]>([]);
  readonly searched = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly columns = ['user', 'type', 'status', 'created', 'actions'];
  private readonly store = inject(AuthStore);
  readonly meId = computed(() => this.store.me()?.id);

  typeLabel = (u: AdminUserRow) =>
    u.isPlatformAdmin ? 'Administrator' : (TYPE_LABEL[u.accountType] ?? u.accountType);
  statusLabel = (s: AdminUserRow['status']) => STATUS_LABEL[s];

  async search() {
    if (this.form.invalid) return this.form.markAllAsTouched();
    this.busy.set(true);
    this.error.set(null);
    try {
      const { q, reason } = this.form.getRawValue();
      this.rows.set(await this.api.adminUsers(q, reason));
      this.searched.set(true);
    } catch (err) {
      this.error.set(applyServerErrors(this.form, err));
    } finally {
      this.busy.set(false);
    }
  }

  async setStatus(u: AdminUserRow, status: AdminUserRow['status']) {
    const reason = prompt(
      `Powód zmiany statusu konta ${u.username} (min. 5 znaków):`,
      this.form.controls.reason.value,
    );
    if (!reason) return;
    try {
      await this.api.adminSetStatus(u.id, status, reason);
      this.rows.update((rows) => rows.map((r) => (r.id === u.id ? { ...r, status } : r)));
    } catch (err) {
      this.error.set(toApiError(err).message);
    }
  }
}
