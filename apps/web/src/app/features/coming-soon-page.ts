import { Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'pl-coming-soon',
  imports: [MatCardModule],
  template: `
    <div class="page">
      <mat-card appearance="outlined">
        <mat-card-content>
          <h2>Wkrótce</h2>
          <p class="muted">Ten moduł powstanie w etapie {{ stage() }} planu (docs/PLAN.md).</p>
        </mat-card-content>
      </mat-card>
    </div>
  `,
})
export default class ComingSoonPage {
  readonly stage = input<number>();
}
