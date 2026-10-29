import { Component, computed, input } from '@angular/core';
import { initial, personColor } from '../person-color';

/** Okrągły awatar z inicjałem w stałym kolorze osoby; `md` = wysokość kontrolki, `sm` = tagu. */
@Component({
  selector: 'pl-avatar',
  template: `{{ letter() }}`,
  host: {
    class: 'avatar',
    '[class.small]': "size() === 'sm'",
    '[style.background]': 'background()',
    'aria-hidden': 'true',
  },
  styles: `
    :host {
      display: inline-grid;
    }
  `,
})
export class Avatar {
  readonly name = input.required<string>();
  /** Stable key for the colour (usually the person's id); without it the avatar is ink-coloured. */
  readonly colorKey = input<string>();
  readonly size = input<'md' | 'sm'>('md');
  readonly letter = computed(() => initial(this.name()));
  readonly background = computed(() => {
    const key = this.colorKey();
    return key ? personColor(key) : null;
  });
}
