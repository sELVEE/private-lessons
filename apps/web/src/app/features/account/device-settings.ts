import { HttpClient } from '@angular/common/http';
import { Component, inject, type OnInit, signal } from '@angular/core';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { applyServerErrors, toApiError } from '../../core/api-error';
import { AuthStore } from '../../core/auth.store';

/** Push notifications on this device and account deletion. */
@Component({
  selector: 'pl-device-settings',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
  ],
  template: `
    @if (error(); as e) {
      <div class="error-banner" role="alert">{{ e }}</div>
    }
    <mat-card appearance="outlined">
      <mat-card-header>
        <mat-icon mat-card-avatar fontSet="material-symbols-outlined">notifications</mat-icon>
        <mat-card-title>Powiadomienia na tym urządzeniu</mat-card-title>
        <mat-card-subtitle>Przypomnienia o lekcjach, odwołania i zmiany terminów</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        @if (!push.isEnabled) {
          <p class="muted">
            Powiadomienia działają w zainstalowanej aplikacji (lub wersji produkcyjnej w
            przeglądarce). E-maile przychodzą zawsze.
          </p>
        } @else if (!serverKey()) {
          <p class="muted">Serwer nie ma skonfigurowanych powiadomień push.</p>
        } @else {
          <mat-slide-toggle
            [checked]="subscribed()"
            (change)="toggle($event.checked)"
            [disabled]="busy()"
          >
            Powiadomienia push
          </mat-slide-toggle>
        }
      </mat-card-content>
    </mat-card>

    @if (!store.me()?.isPlatformAdmin) {
      <mat-card appearance="outlined" class="danger">
        <mat-card-header>
          <mat-icon mat-card-avatar fontSet="material-symbols-outlined">delete_forever</mat-icon>
          <mat-card-title>Usuń konto</mat-card-title>
          <mat-card-subtitle>Trwale usuwa konto i wszystkie Twoje dane</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (!confirming()) {
            <button mat-stroked-button (click)="confirming.set(true)">Chcę usunąć konto</button>
          } @else {
            <p>
              @if (store.me()?.accountType === 'tutor') {
                Usuniesz też swoją pracownię: uczniów, lekcje, notatki, rozliczenia i materiały.
              } @else {
                Usuniesz swoje lekcje, notatki, zadania i postępy u wszystkich korepetytorów.
              }
              Tej operacji nie można cofnąć.
            </p>
            <form [formGroup]="form" (ngSubmit)="remove()" class="form-stack narrow">
              <mat-form-field>
                <mat-label>Hasło</mat-label>
                <input
                  matInput
                  type="password"
                  formControlName="password"
                  autocomplete="current-password"
                />
                <mat-error>{{
                  form.controls.password.errors?.['server'] ?? 'Podaj hasło'
                }}</mat-error>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Wpisz USUŃ</mat-label>
                <input matInput formControlName="confirm" />
                <mat-error>{{
                  form.controls.confirm.errors?.['server'] ?? 'Wpisz USUŃ'
                }}</mat-error>
              </mat-form-field>
              <div class="row-actions">
                <button mat-button type="button" (click)="confirming.set(false)">Anuluj</button>
                <button mat-flat-button class="warn" type="submit" [disabled]="busy()">
                  Usuń konto na zawsze
                </button>
              </div>
            </form>
          }
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 16px;
    }
    .narrow {
      max-width: 400px;
    }
    .warn {
      --mat-button-filled-container-color: var(--mat-sys-error);
      --mat-button-filled-label-text-color: var(--mat-sys-on-error);
    }
    mat-icon[mat-card-avatar] {
      display: grid;
      place-items: center;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
    }
    .danger mat-icon[mat-card-avatar] {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }
  `,
})
export class DeviceSettings implements OnInit {
  private readonly http = inject(HttpClient);
  readonly push = inject(SwPush);
  readonly store = inject(AuthStore);

  readonly serverKey = signal<string | null>(null);
  readonly subscribed = signal(false);
  readonly busy = signal(false);
  readonly confirming = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = inject(NonNullableFormBuilder).group({
    password: ['', Validators.required],
    confirm: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^USUŃ$/)],
    }),
  });

  async ngOnInit() {
    if (!this.push.isEnabled) return;
    try {
      const { publicKey } = await firstValueFrom(
        this.http.get<{ publicKey: string | null }>('/api/push/key'),
      );
      this.serverKey.set(publicKey);
      this.push.subscription.subscribe((s) => this.subscribed.set(!!s));
    } catch {
      // push stays unavailable
    }
  }

  async toggle(on: boolean) {
    this.busy.set(true);
    this.error.set(null);
    try {
      if (on) {
        const sub = await this.push.requestSubscription({ serverPublicKey: this.serverKey()! });
        await firstValueFrom(this.http.post('/api/push/subscribe', sub.toJSON()));
      } else {
        const sub = await firstValueFrom(this.push.subscription);
        if (sub)
          await firstValueFrom(this.http.post('/api/push/unsubscribe', { endpoint: sub.endpoint }));
        await this.push.unsubscribe();
      }
    } catch (err) {
      this.error.set(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Przeglądarka zablokowała powiadomienia — zezwól na nie w ustawieniach strony.'
          : toApiError(err).message,
      );
    } finally {
      this.busy.set(false);
    }
  }

  async remove() {
    if (this.form.invalid) return this.form.markAllAsTouched();
    this.busy.set(true);
    try {
      await firstValueFrom(this.http.post('/api/account/delete', this.form.getRawValue()));
      this.store.clear();
    } catch (err) {
      this.error.set(applyServerErrors(this.form, err));
    } finally {
      this.busy.set(false);
    }
  }
}
