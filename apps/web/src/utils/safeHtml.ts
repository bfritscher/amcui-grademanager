import DOMPurify from 'dompurify';

// Saved documents and live updates are untrusted, including legacy projects.
// Images resolve through project asset IDs after sanitizing, never supplied URLs.
export function safeHtml(value: string): string {
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS:
      'p br b strong i em u s sub sup span div mark var tt code pre ul ol li table tbody thead tfoot tr td th h1 h2 h3 h4 h5 h6 hr img blockquote box figure'.split(
        ' '
      ),
    ALLOWED_ATTR: 'id class style alt colspan rowspan start value spellcheck type'.split(' '),
    ALLOW_DATA_ATTR: true,
    ALLOW_ARIA_ATTR: false,
    CUSTOM_ELEMENT_HANDLING: { tagNameCheck: /^box$/, attributeNameCheck: null }
  });
}
