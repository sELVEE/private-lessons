import { Component, input } from '@angular/core';

/** Liczba z podpisem (saldo, wpłaty, frekwencja…) — jeden wygląd w całej aplikacji. */
@Component({
  selector: 'pl-stat',
  template: `
    <span class="label">{{ label() }}</span>
    <span class="value" [class]="tone()">{{ value() }}</span>
    @if (hint()) {
      <span class="hint">{{ hint() }}</span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--pl-space-xs);
      min-width: 0;
    }
    .label {
      font-size: 13px;
      font-weight: 600;
      color: var(--pl-ink-soft);
    }
    :host-context(.pl-dark) .label,
    :host-context(.pl-dark) .hint {
      color: var(--pl-on-ink-soft);
    }
    .value {
      font-family: var(--pl-font-display);
      font-size: 32px;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
    .value.accent {
      color: var(--pl-accent-text);
    }
    :host-context(.pl-dark) .value.accent {
      color: var(--pl-accent);
    }
    .value.good {
      color: var(--pl-good);
    }
    .hint {
      font-size: 13px;
      color: var(--pl-ink-soft);
    }
  `,
})
export class Stat {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string>();
  readonly tone = input<'default' | 'accent' | 'good'>('default');
}
