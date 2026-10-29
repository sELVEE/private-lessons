import { DatePipe } from '@angular/common';
import { Component, inject, type OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { RouterLink } from '@angular/router';
import type { ChildInfo } from '@pl/shared';
import { toApiError } from '../../core/api-error';
import { TeachingApi } from '../../core/teaching-api';
import { statusLabel, studentLevel } from '../labels';

@Component({
  selector: 'pl-children-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
  ],
  template: `
    <div class="page">
      <h1>Dzieci</h1>
      @if (error(); as e) {
        <div class="error-banner" role="alert">{{ e }}</div>
      }
      @if (message(); as m) {
        <div class="info-banner" role="status">{{ m }}</div>
      }

      <mat-card appearance="outlined" class="add">
        <mat-card-header><mat-card-title>Połącz konto dziecka</mat-card-title></mat-card-header>
        <mat-card-content>
          <p class="muted">
            Poproś dziecko o kod: w aplikacji <em>Konto → Rodzice → Wygeneruj kod</em>. Kod jest
            ważny 24 godziny.
          </p>
          <form (ngSubmit)="link()" class="inline">
            <mat-form-field>
              <mat-label>Kod od dziecka</mat-label>
              <input
                matInput
                [formControl]="code"
                placeholder="ABCD-2345"
                autocapitalize="characters"
              />
            </mat-form-field>
            <button mat-flat-button type="submit" [disabled]="code.invalid || busy()">
              Połącz
            </button>
          </form>
        </mat-card-content>
      </mat-card>

      @for (child of children(); track child.id) {
        <mat-card appearance="outlined" class="child">
          <mat-card-header>
            <div mat-card-avatar class="avatar">{{ child.displayName.charAt(0) }}</div>
            <mat-card-title>{{ child.displayName }}</mat-card-title>
            <mat-card-subtitle>{{ level(child) }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <mat-list>
              @for (e of child.enrollments; track e.id) {
                <a mat-list-item [routerLink]="['/app/cooperation', e.id]">
                  <span matListItemTitle>{{ e.subject.name }} — {{ e.tutor.displayName }}</span>
                  <span matListItemLine class="muted">
                    {{ statusLabel(e.status) }} · od {{ e.startedAt | date: 'd.MM.yyyy' }}
                  </span>
                </a>
              } @empty {
                <p class="muted">Dziecko nie ma jeszcze korepetytora w aplikacji.</p>
              }
            </mat-list>
          </mat-card-content>
          <mat-card-actions align="end">
            <button mat-button (click)="unlink(child)">Odłącz</button>
          </mat-card-actions>
        </mat-card>
      } @empty {
        @if (loaded()) {
          <p class="muted">Nie masz jeszcze połączonych kont dzieci.</p>
        }
      }
    </div>
  `,
  styles: `
    .add,
    .child {
      margin-bottom: 16px;
      max-width: 640px;
    }
    .inline {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
  `,
})
export default class ChildrenPage implements OnInit {
  private readonly api = inject(TeachingApi);
  readonly children = signal<ChildInfo[]>([]);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly busy = signal(false);
  readonly loaded = signal(false);
  readonly code = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(8)],
  });
  readonly level = studentLevel;
  readonly statusLabel = statusLabel;

  ngOnInit() {
    return this.reload();
  }

  link() {
    return this.run(async () => {
      const l = await this.api.redeemParentCode(this.code.value);
      this.code.reset();
      this.message.set(`Połączono z kontem: ${l.student.displayName}`);
    });
  }

  unlink(child: ChildInfo) {
    if (!confirm(`Odłączyć konto ${child.displayName}? Stracisz wgląd w jego lekcje.`)) return;
    return this.run(async () => {
      await this.api.removeParentLink(child.linkId);
      this.message.set(null);
    });
  }

  private async run(fn: () => Promise<void>) {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
      await this.reload();
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.busy.set(false);
    }
  }

  private async reload() {
    try {
      this.children.set(await this.api.children());
    } catch (err) {
      this.error.set(toApiError(err).message);
    } finally {
      this.loaded.set(true);
    }
  }
}
