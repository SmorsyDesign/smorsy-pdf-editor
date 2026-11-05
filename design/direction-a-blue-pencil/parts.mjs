// Shared pieces for the static prototypes. Prototype tooling only, never shipped.

export const key = (p, k) => (p === 'win' ? `Ctrl+${k}` : `⌘${k}`);
const redoKey = (p) => (p === 'win' ? 'Ctrl+Y' : '⇧⌘Z');

const ICONS = {
  select: '<path d="M3.5 2.5l9 5-4 1-2 4z"/>',
  text: '<path d="M3 4V2.75h10V4M8 2.75v10.5M6 13.25h4"/>',
  note: '<path d="M10.5 2.5l3 3-7.5 7.5-3.75.75.75-3.75zM2.5 14.5h11"/>',
  sign: '<path d="M2 11.5c2-5 3.5-8 4.75-8 1.75 0-1.25 8 .5 8 1.25 0 1.75-2.75 3-2.75 1 0 .75 2 2 2h1.75M2 14.25h12"/>',
  pages: '<path d="M5.5 4.5v-2h8v9h-2M2.5 4.5h9v9h-9z"/>',
  undo: '<path d="M5.5 3l-3 3 3 3M2.5 6h7a4 4 0 010 8h-3"/>',
  redo: '<path d="M10.5 3l3 3-3 3M13.5 6h-7a4 4 0 000 8h3"/>',
  left: '<path d="M2.5 4h11M2.5 8h7M2.5 12h9"/>',
  center: '<path d="M2.5 4h11M4.5 8h7M3.5 12h9"/>',
  right: '<path d="M2.5 4h11M6.5 8h7M4.5 12h9"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  trash: '<path d="M2.5 4.5h11M6 4.5v-2h4v2M4 4.5l.75 9h6.5l.75-9"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  minus: '<path d="M3 8h10"/>',
  info: '<circle cx="8" cy="8" r="6"/><path d="M8 7.5v3.5M8 5h0"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3 3"/>',
  up: '<path d="M4 10l4-4 4 4"/>',
  down: '<path d="M4 6l4 4 4-4"/>',
  marker: '<path d="M9.5 2.5l4 4-6 6H3.5v-4zM2.5 14.5h11"/>',
  underline: '<path d="M4.5 2.5v5a3.5 3.5 0 007 0v-5M3 14h10"/>',
  strike: '<path d="M2.5 8h11M11 4.5C10.5 3.2 9.4 2.5 8 2.5c-1.8 0-3 1-3 2.5 0 .8.3 1.4 1 2M5 11.5c.5 1.3 1.6 2 3 2 1.8 0 3-1 3-2.5"/>',
  pen: '<path d="M2.5 13.5c3-1 2-5 4.5-7 2-1.5 5-1 6.5-3"/>',
  rect: '<path d="M2.5 4h11v8h-11z"/>',
  ellipse: '<ellipse cx="8" cy="8" rx="5.5" ry="4.5"/>',
  arrow: '<path d="M3 13L13 3M7 3h6v6"/>',
  pin: '<path d="M2.5 2.5h11v8l-3 3h-8zM10.5 13.5v-3h3"/>',
  image: '<path d="M2.5 3h11v10h-11zM2.5 11l3-3 2.5 2.5 2-2 3.5 3.5"/><circle cx="10.5" cy="6" r="1"/>',
  whiteout: '<path d="M2.5 4h11v8h-11z"/><path d="M5 8h6" stroke-dasharray="2 2"/>',
  rotl: '<path d="M2.5 3v3.5H6M2.8 6.5A5.5 5.5 0 118 13.5"/>',
  rotr: '<path d="M13.5 3v3.5H10M13.2 6.5A5.5 5.5 0 108 13.5"/>',
  copy: '<path d="M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3"/>',
  extract: '<path d="M3 9.5v4h10v-4M8 2.5v8M5 7.5l3 3 3-3"/>',
  insert: '<path d="M3.5 2.5h9v11h-9zM8 5.5v5M5.5 8h5"/>',
  merge: '<path d="M3 2.5v3c0 2 5 2.5 5 5v3M13 2.5v3c0 2-5 2.5-5 5M5.5 11l2.5 2.5 2.5-2.5"/>',
  split: '<path d="M8 2.5v4c0 2-5 2.5-5 4v3M8 6.5c0 2 5 2.5 5 4v3M1 11.5l2 2 2-2M11 11.5l2 2 2-2"/>',
  check: '<path d="M3 8.5l3.5 3.5 6.5-8"/>',
  warn: '<path d="M8 2.5l6 11H2zM8 6.5v3.5M8 12h0"/>',
  error: '<circle cx="8" cy="8" r="6"/><path d="M8 4.75v4M8 11.25h0"/>',
  lock: '<path d="M3.5 7.5h9v6h-9zM5.5 7.5v-2a2.5 2.5 0 015 0v2"/>',
  sidebar: '<path d="M2.5 3h11v10h-11zM6 3v10"/>',
};

export const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 16 16" aria-hidden="true">${ICONS[name]}</svg>`;

const MODES = [
  ['select', 'Select', 'select.html'],
  ['text', 'Edit text', 'edit-text.html'],
  ['note', 'Annotate', 'annotate.html'],
  ['sign', 'Sign', 'sign.html'],
  ['pages', 'Pages', 'pages.html'],
];

const winChrome = (title) => `<div class="win-chrome" aria-hidden="true">
    <div class="win-title"><span>${title === 'Smorsy PDF Editor' ? title : `${title} - Smorsy PDF Editor`}</span><span class="win-controls"><i>–</i><i>□</i><i>×</i></span></div>
    <div class="win-menu"><span>File</span><span>Edit</span><span>View</span><span>Document</span><span>Help</span></div>
  </div>`;

export function bar({ p, mode, file, state, redo = false }) {
  const os = p === 'win' ? '' : '<div class="os-controls" aria-hidden="true"><i></i><i></i><i></i></div>';
  if (!mode) {
    return `<header class="bar">
    <div class="bar-start">${os}<span class="app-name">Smorsy PDF Editor</span></div>
    <span></span>
    <div class="bar-end"></div>
  </header>`;
  }
  const modes = MODES.map(([id, label, href]) => `<a class="mode" href="${href}"${id === mode ? ' aria-current="page"' : ''}>${icon(id)}${label}</a>`).join('\n      ');
  return `<header class="bar">
    <div class="bar-start">${os}
      <div class="file"><span class="file-name">${file}</span><span class="file-state">${state}</span></div>
    </div>
    <nav class="modes" aria-label="Editor mode">
      ${modes}
    </nav>
    <div class="bar-end">
      <a class="icon-btn" href="select.html" aria-label="Search" title="Search (${key(p, 'F')})">${icon('search')}</a>
      <button class="icon-btn" aria-label="Undo" title="Undo (${key(p, 'Z')})">${icon('undo')}</button>
      <button class="icon-btn" aria-label="Redo" title="Redo (${redoKey(p)})"${redo ? '' : ' disabled'}>${icon('redo')}</button>
      <a class="btn btn-primary" href="error-save.html">Save a copy</a>
    </div>
  </header>`;
}

export function thumbs(changes = 2) {
  const label = changes ? `<span class="thumb-label">1</span><span class="thumb-label">${changes} changes</span>` : '<span class="thumb-label">1</span>';
  const others = [2, 3, 4].map((n) => `<li><button class="thumb" aria-label="Page ${n}"><span class="thumb-page"></span><span class="thumb-label">${n}</span></button></li>`).join('');
  return `<aside class="thumbs" aria-label="Pages"><ol>
        <li><button class="thumb" aria-current="page" aria-label="Page 1${changes ? `, ${changes} changes` : ''}"><span class="thumb-page"></span>${label}</button></li>
        ${others}
      </ol></aside>`;
}

export function status({ page = 'Page 1 of 4', hint = '', extra = '', right = 'Your original file stays unchanged', zoom = '94%', toggle = true }) {
  const zoomGroup = zoom ? `<div class="zoom" role="group" aria-label="Zoom">
        <button class="icon-btn" aria-label="Zoom out">${icon('minus')}</button><span>${zoom}</span><button class="icon-btn" aria-label="Zoom in">${icon('plus')}</button>
      </div>` : '';
  const pageToggle = toggle ? `<button class="icon-btn thumbs-toggle" aria-label="Show page thumbnails">${icon('sidebar')}</button>` : '';
  return `<footer class="status">
    <div class="status-part">${pageToggle}<span>${page}</span>${hint ? `<span class="status-hint">${hint}</span>` : ''}${extra}</div>
    <div class="status-part"><span>${right}</span>${zoomGroup}</div>
  </footer>`;
}

export const tickKey = `<span class="status-hint"><i class="tick-key"></i>Solid marks show what you've changed</span>`;

const OPEN_RENT = `Monthly rent for the renewal term is $1,760<span class="caret"></span>, due on the first day of each<br>month. A late fee of $45 applies after the fifth day of the month.`;

// One page of the sample lease. `swap` replaces exact phrases for marks and hits.
export function lease({ edit = false, rent, tenant = '', date = '', overlay = '', cls = '', swap = [], hover = false }) {
  const e = edit ? ' editable' : '';
  const changed = edit ? ' editable changed' : ' was-changed';
  const rentBlock = rent ?? `<span class="ln${e} gap-8">Monthly rent for the renewal term is $1,760, due on the first day of each</span>
        <span class="ln${e}">month. A late fee of $45 applies after the fifth day of the month.</span>`;
  const cell = (t) => `<td><span class="ln${e}">${t}</span></td>`;
  let html = `<article class="paper ${cls}">
        <span class="ln lh-name${e}">Maple Court Apartments</span>
        <span class="ln lh-addr${e}">1840 Harbor Street, Portland, OR 97201</span>
        <span class="ln doc-title${e} gap-24">Lease Renewal Agreement</span>
        <span class="ln${e} gap-8">This agreement renews the lease for Apartment 4B between Maple Court</span>
        <span class="ln${changed}">Apartments and Mara Okafor, dated March 3, 2025.</span>
        <span class="ln doc-h${e} gap-16">1. Renewal term</span>
        <span class="ln${e}${hover ? ' is-hover' : ''}">The renewal term begins on April 1, 2027 and ends on March 31, 2028.</span>
        <span class="ln doc-h${e} gap-16">2. Rent</span>
        ${rentBlock}
        <span class="ln doc-h${e} gap-16">3. Summary of terms</span>
        <table class="terms gap-8">
          <tr>${cell('Monthly rent')}${cell('$1,760')}</tr>
          <tr>${cell('Security deposit')}${cell('$1,500, held from the original lease')}</tr>
          <tr>${cell('Parking space')}${cell('Space 22, included in rent')}</tr>
          <tr>${cell('Notice to end lease')}${cell('60 days in writing')}</tr>
        </table>
        <span class="ln doc-h${e} gap-16">4. Other terms</span>
        <span class="ln${e}">All other terms of the original lease stay in effect. Pets remain subject to</span>
        <span class="ln${e}">the building policy attached as Schedule B. Tenant agrees to keep renter's</span>
        <span class="ln${e}">insurance in place for the full renewal term.</span>
        <div class="sig-grid gap-40">
          <div><div class="sig-line">${tenant}</div><div class="sig-label">Tenant: Mara Okafor</div></div>
          <div><div class="sig-line">${date}</div><div class="sig-label">Date</div></div>
        </div>
        <div class="sig-grid gap-24">
          <div><div class="sig-line"></div><div class="sig-label">Owner's agent: Daniel Reyes</div></div>
          <div><div class="sig-line"></div><div class="sig-label">Date</div></div>
        </div>
        <div class="doc-foot"><span>Maple Court form LR-7</span><span>Page 1 of 4</span></div>
        ${overlay}
      </article>`;
  for (const [from, to] of swap) html = html.replace(from, to);
  return html;
}

export const openRent = (extra = '') => `<div class="edit-open ${extra}" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Edit text block" spellcheck="false">${OPEN_RENT}</div>`;

export function formatBar({ font = 'Liberation Serif', note = 'Replaces Times New Roman', noteCaution = false } = {}) {
  return `<div class="format" role="toolbar" aria-label="Text format">
          <button class="fsel" aria-label="Font: ${font}">${font}</button>
          <button class="fsel fsize" aria-label="Size: 12 point">12 pt</button>
          <span class="sep"></span>
          <button class="icon-btn" aria-label="Bold" aria-pressed="false"><b>B</b></button>
          <button class="icon-btn" aria-label="Italic" aria-pressed="false"><em>I</em></button>
          <span class="sep"></span>
          <button class="icon-btn" aria-label="Align left" aria-pressed="true">${icon('left')}</button>
          <button class="icon-btn" aria-label="Align centre" aria-pressed="false">${icon('center')}</button>
          <button class="icon-btn" aria-label="Align right" aria-pressed="false">${icon('right')}</button>
          <span class="sep"></span>
          <button class="icon-btn" aria-label="Text colour: near black"><span class="swatch"></span></button>
          <span class="sep"></span>
          <span class="font-note${noteCaution ? ' is-caution' : ''}">${icon(noteCaution ? 'warn' : 'info')}${note}</span>
        </div>`;
}

export function signPanel({ picked = 0 } = {}) {
  const slip = (i, cls, label, text, what = 'signature') => `<li class="slip"><a class="slip-pick" href="sign.html" role="button" aria-pressed="${i === picked}" aria-label="Place ${what}: ${label}"><span class="ink ${cls}">${text}</span></a><button class="icon-btn slip-del" aria-label="Delete this ${what}">${icon('trash')}</button></li>`;
  return `<aside class="panel" aria-label="Signatures">
      <div class="panel-head"><h2>Add a signature</h2><a class="icon-btn" href="edit-text.html" aria-label="Close signatures">${icon('close')}</a></div>
      <p class="hint">Drag one onto the page, or select it and click where it goes.</p>
      <h3>Signatures</h3>
      <ul class="slips">
        ${slip(0, 'ink-caveat', 'Mara Okafor, handwritten', 'Mara Okafor')}
        ${slip(1, 'ink-sacramento', 'Mara Okafor, formal', 'Mara Okafor')}
      </ul>
      <a class="btn add" href="signature-draw.html">${icon('plus')}Create signature</a>
      <p class="slot-note">2 of 3 saved. Stored only on this computer.</p>
      <h3>Initials</h3>
      <ul class="slips">
        ${slip(2, 'ink-dancing', 'M O', 'M.O.', 'initials')}
      </ul>
      <a class="btn add" href="signature-draw.html">${icon('plus')}Create initials</a>
      <label class="check"><input type="checkbox" checked>Add today's date beside it</label>
      <div class="panel-foot"><p>This places a picture of your signature. For a certified digital signature, choose Document, then Sign with certificate.</p></div>
    </aside>`;
}

export function page({ p, base, title, content, screenTitle, winTitle }) {
  return `<!doctype html>
<html lang="en" data-platform="${p}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${screenTitle}: Smorsy PDF Editor</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="${base}../fonts/fonts.css">
<link rel="stylesheet" href="${base}tokens.css">
<link rel="stylesheet" href="${base}../shared/paper.css">
<link rel="stylesheet" href="${base}styles.css">
<link rel="stylesheet" href="${base}screens.css">
</head>
<body>
<div class="window${p === 'win' ? ' win' : ''}">
  ${p === 'win' ? winChrome(winTitle ?? title) : ''}
  ${content}
</div>
</body>
</html>
`;
}
