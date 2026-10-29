import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders math with KaTeX', () => {
    const html = renderMarkdown('Wzór: $x^2$ oraz $$\\frac{a}{b}$$');
    expect(html).toContain('katex');
    expect(html).toContain('<math');
  });

  it('keeps the SVG KaTeX draws square roots with', () => {
    expect(renderMarkdown('$\\sqrt{2}$')).toContain('<svg');
  });

  it('removes scripts and event handlers', () => {
    const html = renderMarkdown(
      '<img src=x onerror="alert(1)"><script>alert(2)</script>[a](javascript:alert(3))',
    );
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
    expect(
      renderMarkdown('<svg><script>alert(1)</script><a href="javascript:alert(1)">x</a></svg>'),
    ).not.toMatch(/script|javascript:/);
  });
});
