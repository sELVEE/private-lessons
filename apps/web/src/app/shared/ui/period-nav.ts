import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

/** Poprzedni / bieżący okres / następny — dla kalendarza, rozliczeń i każdej listy w czasie. */
@Component({
  selector: 'pl-period-nav',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  template: `
    <button
      matIconButton
      type="button"
      (click)="prev.emit()"
      [attr.aria-label]="prevLabel()"
      [matTooltip]="prevLabel()"
    >
      <mat-icon fontSet="material-symbols-outlined">chevron_left</mat-icon>
    </button>
    @if (label()) {
      <span class="label">{{ label() }}</span>
    }
    <ng-content />
    <button
      matIconButton
      type="button"
      (click)="next.emit()"
      [attr.aria-label]="nextLabel()"
      [matTooltip]="nextLabel()"
    >
      <mat-icon fontSet="material-symbols-outlined">chevron_right</mat-icon>
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--pl-space-xs);
    }
    .label {
      min-width: 128px;
      text-align: center;
      font-weight: 700;
      font-size: 14px;
    }
    .label::first-letter {
      text-transform: uppercase;
    }
  `,
})
export class PeriodNav {
  readonly label = input<string>();
  readonly prevLabel = input('Poprzedni okres');
  readonly nextLabel = input('Następny okres');
  readonly prev = output();
  readonly next = output();
}
