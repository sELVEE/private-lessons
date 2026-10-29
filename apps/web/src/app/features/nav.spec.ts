import { describe, expect, it } from 'vitest';
import { NAV } from './nav';

describe('NAV', () => {
  it('starts every dock with „Pulpit” and keeps it short', () => {
    for (const nav of Object.values(NAV)) {
      expect(nav.dock[0]?.path).toBe('/app');
      expect(nav.dock.length).toBeLessThanOrEqual(5);
    }
  });

  it('never shows tutor-only modules to students or parents', () => {
    for (const role of ['student', 'parent'] as const) {
      const all = [...NAV[role].dock, ...NAV[role].more];
      expect(all.some((i) => i.path === '/app/students' || i.path === '/app/subjects')).toBe(false);
    }
  });
});
