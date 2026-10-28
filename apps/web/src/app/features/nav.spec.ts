import { describe, expect, it } from 'vitest';
import { NAV } from './nav';

describe('NAV', () => {
  it('gives every role a dashboard and account entry', () => {
    for (const items of Object.values(NAV)) {
      expect(items[0]?.path).toBe('/app');
      expect(items.at(-1)?.path).toBe('/app/account');
    }
  });

  it('never shows tutor-only modules to students or parents', () => {
    for (const role of ['student', 'parent'] as const) {
      expect(NAV[role].some((i) => i.path === '/app/students')).toBe(false);
    }
  });
});
