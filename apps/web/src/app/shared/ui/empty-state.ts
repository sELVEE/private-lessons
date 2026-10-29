import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Pusty stan listy: ikona, krótki komunikat i opcjonalna akcja (treść komponentu). */
@Component({
  selector: 'pl-empty',
  imports: [MatIconModule],
  template: `
    @if (icon()) {
      <mat-icon fontSet="material-symbols-outlined" aria-hidden="true">{{ icon() }}</mat-icon>
    }
    <p>{{ text() }}</p>
    <ng-content />
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--pl-space-md);
      color: var(--pl-ink-soft);
    }
    p {
      margin: 0;
      flex: 1 1 200px;
    }
  `,
})
export class EmptyState {
  readonly text = input.required<string>();
  readonly icon = input<string>();
}
