// Iconițe în linie (24×24, contur 1,8), decorative: aria-hidden; sensul îl dă textul de lângă ele.
const P = {
  filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8L4 5z"/>',
  drop: '<path d="M12 3.5c3.2 3.9 6 7.3 6 10.5a6 6 0 0 1-12 0c0-3.2 2.8-6.6 6-10.5z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L4 16.8V20h3.2l5.3-5.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19 13 11"/>',
  truck: '<path d="M3 6h11v9H3zM14 9h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.7 2.7L16.2 9.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  external: '<path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"/>',
  tap: '<path d="M4 10h9a3 3 0 0 1 3 3v1M4 7v6M9 10V7h4"/><path d="M16 17.5c0 1.4-.9 2.5-2 2.5s-2-1.1-2-2.5c0-1 1-2.3 2-3.5 1 1.2 2 2.5 2 3.5z"/>',
  glass: '<path d="M6 4h12l-1.5 15a1.5 1.5 0 0 1-1.5 1.3H9a1.5 1.5 0 0 1-1.5-1.3L6 4z"/><path d="M6.6 10c2.3-1 4.6 1 6.9 0s3.3-.6 4-.3"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3z"/><path d="m9 12 2 2 4-4"/>',
  facebook: '<path d="M14 8h2.5V4.5H14A4 4 0 0 0 10 8.5V11H7.5v3.5H10V21h3.5v-6.5H16l.5-3.5h-3V9a1 1 0 0 1 1-1z"/>',
  youtube: '<rect x="3" y="6" width="18" height="12" rx="4"/><path d="m10.5 9.5 4 2.5-4 2.5z"/>',
  tiktok: '<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c.5 2.5 2.2 4 4.8 4.2"/>',
  instagram: '<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><circle cx="17" cy="7" r=".6"/>'
};

export const icon = (name, cls = '') =>
  `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] ?? P.drop}</svg>`;
