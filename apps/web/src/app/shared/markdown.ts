import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import katex from 'katex';
import { Marked, type TokenizerAndRendererExtension } from 'marked';

function math(displayMode: boolean, text: string): string {
  return katex.renderToString(text, {
    displayMode,
    throwOnError: false,
    output: 'htmlAndMathml',
    trust: false,
  });
}

/** `$$…$$` blocks and `$…$` inline math rendered with KaTeX. */
const blockMath: TokenizerAndRendererExtension = {
  name: 'blockMath',
  level: 'block',
  start: (src) => src.indexOf('$$'),
  tokenizer(src) {
    const m = /^\$\$([\s\S]+?)\$\$/.exec(src);
    return m ? { type: 'blockMath', raw: m[0], text: m[1]!.trim() } : undefined;
  },
  renderer: (token) => `<div class="math-block">${math(true, token['text'] as string)}</div>`,
};

const inlineMath: TokenizerAndRendererExtension = {
  name: 'inlineMath',
  level: 'inline',
  start: (src) => src.indexOf('$'),
  tokenizer(src) {
    const m = /^\$\$([^$]+?)\$\$|^\$([^$\n]+?)\$/.exec(src);
    if (!m) return undefined;
    return { type: 'inlineMath', raw: m[0], text: (m[1] ?? m[2])!.trim(), display: !!m[1] };
  },
  renderer: (token) => math(!!token['display'], token['text'] as string),
};

const parser = new Marked({ gfm: true, breaks: true, extensions: [blockMath, inlineMath] });

/** Markdown → sanitised HTML. DOMPurify keeps KaTeX's MathML and inline styles but strips scripts and handlers. */
export function renderMarkdown(text: string): string {
  const html = parser.parse(text ?? '', { async: false }) as string;
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true },
    ADD_ATTR: ['target'],
  });
}

@Component({
  selector: 'pl-markdown',
  template: `<div class="markdown" [innerHTML]="html()"></div>`,
  styles: `
    .markdown {
      overflow-wrap: anywhere;
      line-height: 1.55;
    }
    .markdown :is(h1, h2, h3) {
      margin: 0.8em 0 0.4em;
    }
    .markdown :first-child {
      margin-top: 0;
    }
    .markdown pre,
    .markdown code {
      background: var(--mat-sys-surface-container);
      border-radius: 4px;
      padding: 0 4px;
    }
    .markdown .math-block {
      overflow-x: auto;
      padding: 4px 0;
    }
  `,
})
export class Markdown {
  private readonly sanitizer = inject(DomSanitizer);
  readonly text = input<string | null | undefined>('');
  // Already sanitised by DOMPurify; Angular's own sanitiser would strip KaTeX styles and MathML.
  readonly html = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(renderMarkdown(this.text() ?? '')),
  );
}
