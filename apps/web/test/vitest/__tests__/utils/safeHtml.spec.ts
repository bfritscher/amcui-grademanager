import { describe, expect, it } from 'vitest';
import { safeHtml } from '../../../../src/utils/safeHtml';

describe('saved exam HTML', () => {
  it.each([
    '<img id="first" src="x" onerror="alert(1)">',
    '<svg><g onload="alert(1)"></g></svg>',
    '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
    '<a href="javascript:alert(1)">label</a><iframe srcdoc="<script>alert(1)</script>"></iframe>',
    '<object data="data:text/html,hello"></object><embed src="https://example.com">',
    '<style>body{display:none}</style><script>alert(1)</script>'
  ])('removes executable markup and supplied URLs in %s', (source) => {
    const output = document.createElement('div');
    output.innerHTML = safeHtml(source);
    expect(
      output.querySelectorAll(
        'script, style, iframe, object, embed, svg, math, a, [src], [href], [onerror], [onload], [srcdoc]'
      )
    ).toHaveLength(0);
  });

  it('preserves formatting, asset references, tables and editor metadata', () => {
    const output = document.createElement('div');
    output.innerHTML = safeHtml(
      '<box><p style="text-align: center">Text <mark>variable</mark><strong>bold</strong></p><img id="g123" alt="diagram" data-width="80" data-border="true"><pre id="c123" data-language="js" data-numbers="true">const value = 1;</pre><table><tbody><tr><td colspan="2">Cell</td></tr></tbody></table><hr></box>'
    );
    expect(output.querySelector('box p')?.getAttribute('style')).toBe('text-align: center');
    expect(output.querySelector('img')?.getAttribute('id')).toBe('g123');
    expect(output.querySelector('img')?.getAttribute('data-width')).toBe('80');
    expect(output.querySelector('pre')?.getAttribute('data-language')).toBe('js');
    expect(output.querySelector('td')?.getAttribute('colspan')).toBe('2');
    expect(output.querySelector('hr')).not.toBeNull();
  });
});
