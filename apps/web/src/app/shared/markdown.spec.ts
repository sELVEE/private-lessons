import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders math with KaTeX', () => {
    const html = renderMarkdown('Wzór: $x^2$ oraz $$\\frac{a}{b}$$');
    expect(html).toContain('katex');
    expect(html).toContain('<math');
  });

  it('removes scripts and event handlers', () => {
    const html = renderMarkdown(
      '<img src=x onerror="alert(1)"><script>alert(2)</script>[a](javascript:alert(3))',
    );
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
  });
});
