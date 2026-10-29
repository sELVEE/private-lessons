import { Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

/**
 * Sekcja na karcie Material: tytuł (h2) z opcjonalnym licznikiem i akcjami (`[sectionActions]`),
 * pod nim treść. `tone="dark"` wyróżnia najważniejszą rzecz na ekranie.
 */
@Component({
  selector: 'pl-section',
  imports: [MatCardModule],
  template: `
    <mat-card appearance="outlined" [class.pl-dark]="tone() === 'dark'">
      @if (title() || eyebrow()) {
        <header class="head">
          @if (eyebrow()) {
            <span class="eyebrow">{{ eyebrow() }}</span>
          }
          <div class="row">
            @if (title()) {
              <h2>{{ title() }}</h2>
            }
            @if (count() !== null && count() !== undefined) {
              <span class="pl-tag accent" [attr.aria-label]="count() + ' pozycji'">{{
                count()
              }}</span>
            }
            <span class="spacer"></span>
            <ng-content select="[sectionActions]" />
          </div>
        </header>
      }
      <div class="body"><ng-content /></div>
    </mat-card>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    mat-card {
      height: 100%;
      padding: var(--pl-space-xl);
      gap: var(--pl-space-lg);
    }
    .head {
      display: flex;
      flex-direction: column;
      gap: var(--pl-space-xs);
    }
    .row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--pl-space-sm) var(--pl-space-md);
    }
    h2 {
      margin: 0;
    }
    .spacer {
      flex: 1;
    }
    @media (max-width: 600px) {
      mat-card {
        padding: var(--pl-space-lg);
      }
    }
    .body {
      display: flex;
      flex-direction: column;
      gap: var(--pl-space-md);
      min-width: 0;
    }
  `,
})
export class Section {
  readonly title = input<string>();
  readonly eyebrow = input<string>();
  readonly count = input<number | null>();
  readonly tone = input<'default' | 'dark'>('default');
}
