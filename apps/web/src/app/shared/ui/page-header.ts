import { Location } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

/**
 * Nagłówek każdej strony: opcjonalny powrót, nadtytuł, tytuł i podtytuł po lewej, akcje (treść
 * komponentu) po prawej.
 */
@Component({
  selector: 'pl-page-header',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    @if (back()) {
      <button
        matIconButton
        type="button"
        class="back no-print"
        (click)="location.back()"
        aria-label="Wstecz"
        matTooltip="Wstecz"
      >
        <mat-icon fontSet="material-symbols-outlined">arrow_back</mat-icon>
      </button>
    }
    <div class="titles">
      @if (eyebrow()) {
        <span class="eyebrow">{{ eyebrow() }}</span>
      }
      <h1>{{ title() }}</h1>
      @if (subtitle()) {
        <p class="muted subtitle">{{ subtitle() }}</p>
      }
    </div>
    <div class="actions"><ng-content /></div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--pl-space-md) var(--pl-space-xl);
    }
    .back {
      margin-left: calc(-1 * var(--pl-space-sm));
    }
    .titles {
      flex: 1 1 280px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--pl-space-xs);
    }
    h1 {
      margin: 0;
    }
    h1::first-letter {
      text-transform: uppercase;
    }
    .subtitle {
      margin: 0;
    }
    .actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--pl-space-sm);
    }
    .actions:empty {
      display: none;
    }
  `,
})
export class PageHeader {
  readonly location = inject(Location);
  readonly title = input.required<string>();
  readonly eyebrow = input<string>();
  readonly subtitle = input<string>();
  readonly back = input(false);
}
