// Textul bogat are un vocabular fix (§1.8): ce nu e conținut se scoate la salvare.
const ALLOWED = new Set(['h2', 'h3', 'h4', 'p', 'br', 'ul', 'ol', 'li', 'blockquote', 'figure', 'figcaption', 'img',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'strong', 'em', 'b', 'i', 'sup', 'sub']);
const ATTRS = {a: ['href', 'data-ref', 'data-media', 'target', 'rel'], img: ['src', 'alt', 'data-media', 'width', 'height'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan', 'scope']};

export function sanitizeContent(html) {
  return String(html ?? '')
    .replace(/<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (tag, name, attrs) => {
      const n = name.toLowerCase();
      if (!ALLOWED.has(n)) return '';
      if (tag.startsWith('</')) return `</${n}>`;
      const kept = [];
      for (const m of attrs.matchAll(/([a-z-]+)\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
        const a = m[1].toLowerCase(), v = m[3] ?? m[4];
        if (!(ATTRS[n] ?? []).includes(a)) continue;
        if ((a === 'href' || a === 'src') && /^\s*javascript:/i.test(v)) continue;
        kept.push(`${a}="${v.replace(/"/g, '&quot;')}"`);
      }
      return `<${n}${kept.length ? ' ' + kept.join(' ') : ''}>`;
    })
    .trim();
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);

// Telefoanele în orice formă (0372 887 572, +40372887572, 0372.887.572) au aceeași cheie.
export const phoneKey = s => String(s ?? '').replace(/\D/g, '').replace(/^40/, '0');
