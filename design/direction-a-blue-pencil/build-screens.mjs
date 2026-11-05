// Builds the static screens from shared parts: node build-screens.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bar, formatBar, icon, key, lease, openRent, page, signPanel, status, thumbs, tickKey } from './parts.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const LEASE = 'Lease renewal 2027.pdf';
const CLAIM = 'Home insurance claim.pdf';
const FORM = 'Field trip consent.pdf';

const stage = (inner, over = '') => `<div class="stage"><main class="canvas" aria-label="Page 1 of the document" tabindex="0">${inner}</main>${over}</div>`;

const signature = 'M36 118c10-42 24-78 32-78 9 0-6 66 2 68 8 2 18-54 27-54 8 0 0 50 9 52 7 1 12-16 20-22 7-5 9 10 16 10 7 0 7-14 14-14 6 0 2 14 10 14 8 0 8-14 15-14 7 0 3 14 12 14 9 0 12-10 20-22M214 68c-14 0-24 16-22 32 2 14 18 18 28 8 12-12 8-40-6-40M244 106c6-16 12-48 18-62M262 88c-8 4-12 8-12 12 4 6 12 10 18 12M282 90c-8-2-14 6-12 14 2 6 10 6 14-2 2-6 2-10 2-12 0 8 2 18 8 18 8 0 10-14 16-28 6-16 10-30 6-30-6 0-10 28-8 62M326 92c-8-2-12 8-10 14 2 6 12 6 14-2 2-8-2-12-4-12M348 88c-2 6-4 14-4 20 2-8 8-18 16-20M60 136c70-8 170-12 300-8';

const screens = {
  // ---------- Start ----------
  start: ({ p }) => ({
    title: 'Start', file: 'Smorsy PDF Editor',
    content: `${bar({ p })}
  <div class="body start-body">
    <div class="start-stage">
      <section class="start-sheet" aria-label="Open a PDF">
        <h1 class="tick">Open a PDF</h1>
        <p class="tick">Drag a file onto this page, or choose one from your computer.</p>
        <div class="start-actions"><a class="btn btn-primary" href="select.html">Choose a file</a><span class="kbd">${key(p, 'O')}</span></div>
        <div class="start-foot">${icon('lock')}<span>Your files stay on this computer. Nothing is uploaded.</span></div>
      </section>
    </div>
    <aside class="recent" aria-label="Recent files">
      <h2>Recent files</h2>
      <ul>
        <li><a class="recent-row" href="select.html"><span class="recent-name">${LEASE}</span><span class="recent-where">Documents/Home, opened today</span></a></li>
        <li><a class="recent-row" href="form.html"><span class="recent-name">${FORM}</span><span class="recent-where">Downloads, opened yesterday</span></a></li>
        <li><a class="recent-row" href="pages.html"><span class="recent-name">${CLAIM}</span><span class="recent-where">Documents/Insurance, opened Oct 28</span></a></li>
        <li><a class="recent-row" href="error-open.html"><span class="recent-name">Scan 0412.pdf</span><span class="recent-where">Downloads, opened Oct 12</span></a></li>
        <li><a class="recent-row recent-missing" href="start.html"><span class="recent-name">Tax summary 2025.pdf</span><span class="recent-where">Moved or renamed. Click to remove.</span></a></li>
      </ul>
      <div class="recent-foot"><button class="btn">Clear recent files</button></div>
    </aside>
  </div>
  ${status({ page: 'Version 1.2', right: 'Works offline', zoom: '', toggle: false })}`,
  }),

  // ---------- Modes ----------
  select: ({ p }) => ({
    title: 'Select', file: LEASE,
    content: `${bar({ p, mode: 'select', file: LEASE, state: '2 unsaved changes' })}
  <div class="body no-panel">
    ${thumbs()}
    ${stage(lease({
      swap: [
        ['2. Rent', '2. <mark>Rent</mark>'],
        ['Monthly rent for the', 'Monthly <mark class="now">rent</mark> for the'],
        ['<td><span class="ln">Monthly rent</span>', '<td><span class="ln">Monthly <mark>rent</mark></span>'],
        ['included in rent', 'included in <mark>rent</mark>'],
        ['begins on April 1, 2027', '<span class="sel">begins on April 1, 2027</span>'],
      ],
      overlay: `<div class="float-bar selection-bar" role="toolbar" aria-label="Selected text"><button class="plain">Copy <span class="kbd">${key(p, 'C')}</span></button><span class="sep"></span><a class="plain tool" href="annotate.html">${icon('marker')}Highlight</a></div>`,
    }), `<form class="float-bar at-top-right" role="search"><input class="search-input" type="search" value="rent" aria-label="Search this document"><span class="count">2 of 6</span><button class="icon-btn" type="button" aria-label="Previous match">${icon('up')}</button><button class="icon-btn" type="button" aria-label="Next match">${icon('down')}</button><button class="icon-btn" type="button" aria-label="Close search">${icon('close')}</button></form>`)}
  </div>
  ${status({ hint: 'Drag across text to select it', extra: tickKey, toggle: false })}`,
  }),

  'edit-text': ({ p }) => ({
    title: 'Edit text', file: LEASE,
    content: `${bar({ p, mode: 'text', file: LEASE, state: '2 unsaved changes' })}
  <div class="body no-panel">
    ${thumbs()}
    ${stage(lease({ edit: true, hover: true, rent: openRent(), overlay: formatBar() }))}
  </div>
  ${status({ hint: 'Click a line to edit it, or click an empty area to add text', extra: tickKey, toggle: false })}`,
  }),

  annotate: ({ p }) => {
    const swatch = (color, label, on = false) => `<button class="swatch-btn" aria-label="Colour: ${label}" aria-pressed="${on}"><span class="tool-swatch" style="background:${color}"></span></button>`;
    const tool = (name, label, on = false) => `<button class="icon-btn" aria-label="${label}" title="${label}" aria-pressed="${on}">${icon(name)}</button>`;
    const row = (name, title, sub) => `<li class="row">${icon(name)}<span class="row-text"><span class="row-title">${title}</span><span class="row-sub">${sub}</span></span><button class="icon-btn" aria-label="Delete ${title.toLowerCase()}">${icon('trash')}</button></li>`;
    return {
      title: 'Annotate', file: LEASE,
      content: `${bar({ p, mode: 'note', file: LEASE, state: '7 unsaved changes' })}
  <div class="body">
    ${thumbs(7)}
    ${stage(lease({
      swap: [
        ['A late fee of $45', 'A <mark>late fee of $45</mark>'],
        ['60 days in writing', '<span class="a-under">60 days in writing</span>'],
        ['Pets remain subject to', '<span class="a-strike">Pets remain subject to</span>'],
        ['<td><span class="ln">$1,760</span>', '<td><span class="ln"><span class="a-circle">$1,760<svg viewBox="0 0 72 36" aria-hidden="true"><path d="M8 20C6 8 28 2 44 3c14 1 26 8 24 17-2 10-22 14-38 13C16 32 4 28 6 16"/></svg></span></span>'],
      ],
      overlay: `<button class="note-pin" style="left:536px;top:296px" aria-label="Open note">${icon('pin')}</button>
        <div class="note-card" style="left:536px;top:328px"><strong>Mara</strong>Ask Daniel whether the late fee can go down to $30.</div>`,
    }), `<div class="float-bar at-top-center" role="toolbar" aria-label="Annotation tools">
        ${tool('marker', 'Highlight', true)}${tool('underline', 'Underline')}${tool('strike', 'Strikethrough')}<span class="sep"></span>
        ${tool('pen', 'Pen')}${tool('rect', 'Rectangle')}${tool('ellipse', 'Ellipse')}${tool('arrow', 'Arrow')}<span class="sep"></span>
        ${tool('pin', 'Sticky note')}${tool('image', 'Image')}${tool('whiteout', 'Whiteout box')}<span class="sep"></span>
        ${swatch('#ffe98a', 'yellow', true)}${swatch('#a8e6b0', 'green')}${swatch('#f7b6c2', 'pink')}${swatch('#9fd4f5', 'blue')}
      </div>`)}
    <aside class="panel" aria-label="Annotations on this page">
      <div class="panel-head"><h2>On this page</h2><span class="kbd">5 annotations</span></div>
      <ul class="rows">
        ${row('marker', 'Highlight', 'late fee of $45')}
        ${row('pin', 'Note', 'Ask Daniel whether the late fee can go down to $30.')}
        ${row('pen', 'Pen drawing', 'Around $1,760')}
        ${row('underline', 'Underline', '60 days in writing')}
        ${row('strike', 'Strikethrough', 'Pets remain subject to')}
      </ul>
      <div class="panel-foot"><p>Annotations can be changed later in other PDF apps. Your original file stays unchanged.</p></div>
    </aside>
  </div>
  ${status({ hint: 'Pick a tool, then drag on the page', extra: '' })}`,
    };
  },

  sign: ({ p }) => ({
    title: 'Sign', file: LEASE,
    content: `${bar({ p, mode: 'sign', file: LEASE, state: '4 unsaved changes' })}
  <div class="body">
    ${thumbs(4)}
    ${stage(lease({
      cls: 'scrolled',
      tenant: `<div class="placed" role="group" aria-label="Placed signature"><span class="ink ink-caveat">Mara Okafor</span>
          <button class="handle h-tl" aria-label="Resize from top left"></button><button class="handle h-tr" aria-label="Resize from top right"></button><button class="handle h-bl" aria-label="Resize from bottom left"></button><button class="handle h-br" aria-label="Resize from bottom right"></button>
          <span class="h-stem"></span><button class="handle h-rot" aria-label="Rotate signature"></button></div>
        <div class="float-bar placed-bar" role="toolbar" aria-label="Signature actions"><button class="icon-btn" aria-label="Rotate 90 degrees">${icon('rotr')}</button><span class="count">0°</span><span class="sep"></span><button class="icon-btn" aria-label="Duplicate">${icon('copy')}</button><button class="icon-btn" aria-label="Delete">${icon('trash')}</button></div>`,
      date: '<span class="ink date-stamp">November 5, 2026</span>',
    }))}
    ${signPanel()}
  </div>
  ${status({ hint: 'Drag the corners to resize, or the top handle to rotate', extra: '' })}`,
  }),

  pages: ({ p }) => {
    const tile = (n, { pressed = false, sheet = '', tag = '', mark = false } = {}) => `<li>${mark ? '<span class="insert-mark" aria-hidden="true"></span>' : ''}<button class="tile" aria-pressed="${pressed}" aria-label="Page ${n}${tag ? `, ${tag}` : ''}">${pressed ? `<span class="tile-check">${icon('check')}</span>` : ''}<span class="tile-sheet ${sheet}"></span><span class="tile-num">${n}</span><span class="tile-tag">${tag}</span></button></li>`;
    const tool = (name, label) => `<button class="tool" aria-label="${label}" title="${label}">${icon(name)}<span class="tool-label">${label}</span></button>`;
    return {
      title: 'Pages', file: CLAIM,
      content: `${bar({ p, mode: 'pages', file: CLAIM, state: '1 unsaved change' })}
  <div class="body full">
    <div class="pages-stage">
      <div class="pages-tools" role="toolbar" aria-label="Page tools">
        ${tool('rotl', 'Rotate left')}${tool('rotr', 'Rotate right')}${tool('copy', 'Duplicate')}${tool('trash', 'Delete')}${tool('extract', 'Extract')}
        <span class="sep"></span>
        ${tool('insert', 'Insert')}${tool('merge', 'Merge')}${tool('split', 'Split')}
      </div>
      <ol class="page-grid" aria-label="Pages in this document">
        ${tile(1)}${tile(2, { tag: '1 change' })}${tile(3, { pressed: true })}${tile(4, { pressed: true })}
        ${tile(5, { sheet: 'wide', tag: 'Landscape' })}${tile(6, { sheet: 'scan', tag: 'Scanned' })}${tile(7, { sheet: 'small', tag: 'Receipt' })}${tile(8)}${tile(9, { mark: true })}${tile(10)}${tile(11)}
      </ol>
    </div>
  </div>
  ${status({ page: '2 of 11 pages selected', hint: 'Drag pages to reorder them', zoom: '', toggle: false })}`,
    };
  },

  // ---------- Signature dialog ----------
  'signature-draw': (ctx) => signatureDialog(ctx, 'draw'),
  'signature-type': (ctx) => signatureDialog(ctx, 'type'),
  'signature-upload': (ctx) => signatureDialog(ctx, 'upload'),

  // ---------- Form ----------
  form: ({ p }) => ({
    title: 'Form filling', file: FORM,
    content: `${bar({ p, mode: 'select', file: FORM, state: 'Unsaved answers' })}
  <div class="body">
    ${thumbs(0).replace(/<li><button class="thumb" aria-label="Page [34]".*?<\/li>/g, '')}
    ${stage(`<form class="paper form-doc" aria-label="Field trip consent form">
        <span class="ln lh-name">Cedar Grove Elementary School</span>
        <span class="ln lh-addr">420 Alder Lane, Portland, OR 97214</span>
        <span class="ln doc-title gap-16">Field Trip Consent Form</span>
        <span class="ln gap-8">Grade 3 visit to the Oregon Coast Aquarium on May 14, 2027. Buses leave at 8:15 am</span>
        <span class="ln">and return by 3:30 pm. Please return this form by April 30.</span>
        <span class="ln doc-h form-h">Student</span>
        <div class="f-grid">
          <label class="f f-3"><span class="f-label">Full name</span><input class="f-input" value="Theo Okafor"></label>
          <label class="f f-1 f-2"><span class="f-label">Grade</span><select class="f-input"><option>3</option></select></label>
          <label class="f" style="grid-column:span 1"><span class="f-label">Room</span><input class="f-input" value="12"></label>
        </div>
        <span class="ln doc-h form-h">Parent or guardian</span>
        <div class="f-grid">
          <label class="f f-3"><span class="f-label">Full name</span><input class="f-input" value="Mara Okafor"></label>
          <label class="f f-3"><span class="f-label">Phone</span><input class="f-input" value="(503) 555-0142"></label>
          <label class="f f-3"><span class="f-label">Emergency contact (required)</span><input class="f-input is-focus"></label>
          <label class="f f-3"><span class="f-label">Emergency phone (required)</span><input class="f-input"></label>
        </div>
        <span class="ln doc-h form-h">Health</span>
        <div class="f-row gap-8">
          <span>Food or medicine allergies?</span>
          <label class="f-choice"><input type="radio" name="allergy" checked>No</label>
          <label class="f-choice"><input type="radio" name="allergy">Yes</label>
        </div>
        <span class="ln doc-h form-h">Permission</span>
        <label class="f-choice gap-8"><input type="checkbox" checked>I give permission for my child to attend this trip.</label>
        <div class="f-grid form-h">
          <div class="f f-4"><span class="f-label">Signature (required)</span><a class="f-sign" href="sign.html">${icon('sign')}Click to sign</a></div>
          <label class="f f-2"><span class="f-label">Date (required)</span><input class="f-input" placeholder="MM/DD/YYYY"></label>
        </div>
        <div class="doc-foot"><span>Cedar Grove form 22-B</span><span>Page 1 of 2</span></div>
      </form>`)}
    <aside class="panel" aria-label="Form progress">
      <div class="panel-head"><h2>Fill in this form</h2></div>
      <p class="hint">Press Tab to move to the next field.</p>
      <p class="slot-note">7 of 11 fields filled</p>
      <h3>Still needed</h3>
      <div>
        <button class="jump">Emergency contact</button>
        <button class="jump">Emergency phone</button>
        <button class="jump">Signature</button>
        <button class="jump">Date</button>
      </div>
      <label class="lock"><input type="checkbox"><span>Lock answers when saving<small>Answers become part of the page, so nobody can change them. Your original file stays fillable.</small></span></label>
    </aside>
  </div>
  ${status({ page: 'Page 1 of 2', right: 'Your original file stays unchanged' })}`,
  }),

  // ---------- Notices and errors ----------
  'font-notice': ({ p }) => ({
    title: 'Font substitution', file: LEASE,
    content: `${bar({ p, mode: 'text', file: LEASE, state: '1 unsaved change' })}
  <div class="body no-panel">
    ${thumbs(0)}
    ${stage(lease({
      edit: true, cls: 'garamond',
      rent: openRent('substituted'),
      overlay: `${formatBar({ note: 'Replaces Garamond', noteCaution: true })}
        <section class="notice notice-caution font-card" role="status">
          <h3>${icon('warn')}Garamond can't show this text</h3>
          <p>This file only stores the characters it used, and it's missing 6 and 7. Your edit uses the closest match instead, so it looks slightly different.</p>
          <div class="compare">
            <div class="compare-row"><span>Rest of the page</span><div class="compare-old">Monthly rent for the renewal term</div></div>
            <div class="compare-row"><span>Your edit</span><div class="compare-new">Monthly rent for the renewal term</div></div>
          </div>
          <div class="notice-actions"><button class="btn btn-primary">Keep Liberation Serif</button><button class="btn">Choose another font</button><button class="btn">Undo edit</button></div>
          <div class="covered">${icon('info')}<span>The old text is covered, not removed, so search and copy can still find it. To remove it completely, use Redact.</span></div>
        </section>`,
    }))}
  </div>
  ${status({ hint: '', extra: `<span class="status-caution">${icon('warn')}1 font replaced</span>`, toggle: false })}`,
  }),

  update: ({ p }) => ({
    title: 'Update prompt', file: LEASE,
    content: `${bar({ p, mode: 'select', file: LEASE, state: '2 unsaved changes' })}
  <div class="body no-panel">
    ${thumbs()}
    ${stage(lease({}), `<section class="notice update-card" role="status" aria-label="Update available">
        <h3>Smorsy PDF Editor 1.3 is ready</h3>
        <p>You have unsaved changes, so nothing will restart now.</p>
        <ul><li>Faster opening for large files</li><li>Better matching for Calibri text</li></ul>
        <div class="notice-actions"><button class="btn btn-primary">Install when I quit</button><button class="btn">Not now</button></div>
        <p class="quiet">Checking for updates is the only thing this app does online. Your documents are never sent.</p>
      </section>`)}
  </div>
  ${status({ hint: '', extra: tickKey, toggle: false })}`,
  }),

  'error-open': ({ p }) => ({
    title: "Can't open file", file: 'Smorsy PDF Editor',
    content: `${bar({ p })}
  <div class="body start-body">
    <div class="start-stage">
      <section class="start-sheet" role="alert">
        <div class="start-error">
          ${icon('error', 'err-icon')}
          <h1>Scan 0412.pdf can't be opened</h1>
        </div>
        <p>The file is damaged or incomplete. This often happens when a download didn't finish.</p>
        <p>Try downloading it again, or ask the sender for a new copy.</p>
        <div class="start-actions"><a class="btn btn-primary" href="start.html">Choose another file</a><button class="btn">Show in ${p === 'win' ? 'File Explorer' : 'Finder'}</button></div>
        <details><summary>Technical details</summary>No PDF header found in the first 1,024 bytes. File size: 18 KB.</details>
        <div class="start-foot">${icon('lock')}<span>Nothing was changed. This file hasn't left your computer.</span></div>
      </section>
    </div>
    <aside class="recent" aria-label="Recent files">
      <h2>Recent files</h2>
      <ul>
        <li><a class="recent-row" href="select.html"><span class="recent-name">${LEASE}</span><span class="recent-where">Documents/Home, opened today</span></a></li>
        <li><a class="recent-row" href="form.html"><span class="recent-name">${FORM}</span><span class="recent-where">Downloads, opened yesterday</span></a></li>
        <li><a class="recent-row" href="pages.html"><span class="recent-name">${CLAIM}</span><span class="recent-where">Documents/Insurance, opened Oct 28</span></a></li>
      </ul>
      <div class="recent-foot"><button class="btn">Clear recent files</button></div>
    </aside>
  </div>
  ${status({ page: 'Version 1.2', right: 'Works offline', zoom: '', toggle: false })}`,
  }),

  'signed-view': ({ p }) => signedScreen(p, false),
  'signed-warning': ({ p }) => signedScreen(p, true),

  'scanned-page': ({ p }) => ({
    title: 'Scanned page', file: 'Old tax letter.pdf',
    content: `${bar({ p, mode: 'text', file: 'Old tax letter.pdf', state: 'No changes' })}
  <div class="body no-panel">
    ${thumbs(0)}
    ${stage('<article class="paper paper-scan" aria-label="Scanned page"></article>', `<section class="notice scan-card" role="status">
        <h3>${icon('info')}This page is a scan, so there's no text to edit</h3>
        <p>It's a picture of the page rather than text. You can still add new text on top of it.</p>
        <div class="notice-actions"><button class="btn btn-primary">Add text</button><button class="btn">Close</button></div>
      </section>`)}
  </div>
  ${status({ page: 'Page 1 of 4', hint: 'Click an empty area to add text', toggle: false })}`,
  }),

  'error-save': ({ p }) => ({
    title: "Can't save", file: LEASE,
    content: `${bar({ p, mode: 'text', file: LEASE, state: '2 unsaved changes' })}
  <div class="body no-panel">
    ${thumbs()}
    ${stage(lease({ edit: true }))}
  </div>
  ${status({ extra: tickKey, toggle: false })}
  <div class="scrim">
    <section class="dialog alert" role="alertdialog" aria-modal="true" aria-labelledby="err-title">
      <div class="alert-body">
        ${icon('error')}
        <div>
          <h2 id="err-title">Your copy wasn't saved</h2>
          <p>The USB drive "BACKUP" is full. It needs about 2 MB more.</p>
          <p>Your edits are still here, and your original file is unchanged.</p>
        </div>
      </div>
      <div class="alert-foot"><a class="btn" href="edit-text.html">Keep editing</a><a class="btn btn-primary" href="edit-text.html">Save somewhere else</a></div>
    </section>
  </div>`,
  }),
};

function signedScreen(p, warning) {
  const dialog = warning ? `<div class="scrim">
    <section class="dialog alert" role="alertdialog" aria-modal="true" aria-labelledby="signed-title">
      <div class="alert-body">
        ${icon('warn', 'signed-warn')}
        <div>
          <h2 id="signed-title">Editing will break the signature</h2>
          <p>This PDF looks digitally signed. If you edit it, your copy's signature will show as invalid in other PDF apps.</p>
          <p>Your original file and its signature stay as they are.</p>
        </div>
      </div>
      <div class="alert-foot"><a class="btn" href="signed-view.html">Keep viewing</a><a class="btn btn-primary" href="edit-text.html">Edit anyway</a></div>
    </section>
  </div>` : '';
  return {
    title: warning ? 'Signed PDF warning' : 'Signed PDF', file: LEASE,
    content: `${bar({ p, mode: 'select', file: LEASE, state: 'Looks signed' }).replace('href="edit-text.html"', 'href="signed-warning.html"')}
  <div class="body no-panel">
    ${thumbs(0)}
    <div class="signed-stage">
      <div class="signed-strip" role="status">${icon('lock')}<span>This PDF looks digitally signed, though the app can’t check signatures yet. You’re only viewing it, so nothing has changed.</span><a class="btn" href="signed-warning.html">Edit anyway</a></div>
      <main class="canvas" aria-label="Page 1 of the document" tabindex="0">${lease({ tenant: '<span class="ink ink-caveat signed-ink">Mara Okafor</span>', date: '<span class="ink date-stamp">November 5, 2026</span>' }).replace('class="ln was-changed"', 'class="ln"').replace('class="paper "', 'class="paper"')}</main>
    </div>
  </div>
  ${status({ hint: 'Select text to copy it', right: 'Signature unchanged', toggle: false })}
  ${dialog}`,
  };
}

function signatureDialog({ p }, tab) {
  const tabs = [['draw', 'Draw'], ['type', 'Type'], ['upload', 'Upload']]
    .map(([id, label]) => `<a class="tab" href="signature-${id}.html"${id === tab ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const kind = `<div><span class="opt-label">Save as</span><div class="choice-row"><label class="choice"><input type="radio" name="kind" checked>Signature</label><label class="choice"><input type="radio" name="kind">Initials</label></div></div>`;
  const ink = `<div><span class="opt-label">Ink</span><div class="choice-row"><label class="choice"><input type="radio" name="ink" checked>Blue</label><label class="choice"><input type="radio" name="ink">Black</label></div></div>`;
  const body = {
    draw: `<div class="pad"><span class="pad-line"></span><span class="pad-hint">Sign above the line with your mouse or trackpad</span><svg viewBox="0 0 512 176" aria-label="Your drawn signature" role="img"><path d="${signature}"/></svg></div>
        <div class="pad-tools"><div><button class="btn">Undo stroke</button><button class="btn">Clear</button></div></div>
        <div class="options">${kind}${ink}</div>`,
    type: `<label class="field-label" for="sig-name">Your name</label><input class="text-input" id="sig-name" value="Mara Okafor">
        <div class="font-options" role="radiogroup" aria-label="Handwriting style">
          <label class="font-opt"><input type="radio" name="font" checked aria-label="Caveat"><span class="ink ink-caveat">Mara Okafor</span></label>
          <label class="font-opt"><input type="radio" name="font" aria-label="Dancing Script"><span class="ink ink-dancing">Mara Okafor</span></label>
          <label class="font-opt"><input type="radio" name="font" aria-label="Sacramento"><span class="ink ink-sacramento">Mara Okafor</span></label>
          <label class="font-opt"><input type="radio" name="font" aria-label="Homemade Apple"><span class="ink ink-apple">Mara Okafor</span></label>
        </div>
        <div class="options">${kind}${ink}</div>`,
    upload: `<div class="file-row"><span><strong>signature-scan.jpg</strong></span><button class="btn">Choose another image</button></div>
        <div class="pad checker"><svg viewBox="0 0 512 176" aria-label="Your uploaded signature with its background removed" role="img"><path d="${signature}"/></svg></div>
        <div class="options"><label class="choice"><input type="checkbox" checked>Remove white background</label></div>
        <p class="foot-note" style="margin-top:8px">Works best with dark ink on plain white paper. The squares show where the page will show through.</p>
        <div class="options">${kind}</div>`,
  }[tab];
  const base = screens.sign({ p });
  return {
    title: `Signature: ${tab}`, file: LEASE,
    content: `${base.content}
  <div class="scrim">
    <section class="dialog" role="dialog" aria-modal="true" aria-labelledby="sig-title">
      <div class="dialog-head"><h2 id="sig-title">Create a signature</h2><a class="icon-btn" href="sign.html" aria-label="Close">${icon('close')}</a></div>
      <nav class="tabs" aria-label="How to create it">${tabs}</nav>
      <div class="dialog-body">${body}</div>
      <div class="dialog-foot"><p class="foot-note">2 of 3 saved. Stored only on this computer.</p><div class="foot-actions"><a class="btn" href="sign.html">Cancel</a><a class="btn btn-primary" href="sign.html">Save signature</a></div></div>
    </section>
  </div>`,
  };
}

const groups = [
  ['Start', ['start']],
  ['Editor modes', ['select', 'edit-text', 'annotate', 'sign', 'pages']],
  ['Signature dialog', ['signature-draw', 'signature-type', 'signature-upload']],
  ['Forms', ['form']],
  ['Notices and errors', ['font-notice', 'update', 'error-open', 'error-save']],
  ['Signed and scanned PDFs', ['signed-view', 'signed-warning', 'scanned-page']],
];

mkdirSync(join(here, 'screens/win'), { recursive: true });
for (const [name, build] of Object.entries(screens)) {
  for (const p of ['mac', 'win']) {
    const s = build({ p });
    const base = p === 'win' ? '../../' : '../';
    const out = join(here, 'screens', p === 'win' ? 'win' : '', `${name}.html`);
    writeFileSync(out, page({ p, base, title: s.file, screenTitle: s.title, content: s.content }));
  }
}

// Step 2's main window: Edit text with the signature panel open.
writeFileSync(join(here, 'index.html'), page({
  p: 'mac', base: '', title: LEASE, screenTitle: 'Main window',
  content: `${bar({ p: 'mac', mode: 'text', file: LEASE, state: '2 unsaved changes' })}
  <div class="body">
    ${thumbs()}
    ${stage(lease({ edit: true, hover: true, rent: openRent(), overlay: formatBar() }))}
    ${signPanel({ picked: -1 })}
  </div>
  ${status({ hint: 'Click a line to edit it, or click an empty area to add text', extra: tickKey })}`,
}).replace(/href="([a-z-]+\.html)"/g, 'href="screens/$1"'));

const card = (name) => `<li><a href="${name}.html"><img src="../../screenshots/blue-pencil/${name}-1280-light.png" width="400" height="250" alt="${screens[name]({ p: 'mac' }).title} screen" loading="lazy"><span>${screens[name]({ p: 'mac' }).title}</span></a><a class="w" href="win/${name}.html">Windows version</a></li>`;
writeFileSync(join(here, 'screens/index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Blue Pencil screens: Smorsy PDF Editor</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="../../fonts/fonts.css">
<link rel="stylesheet" href="../tokens.css">
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: var(--space-8) var(--space-6); background: var(--chrome); color: var(--text); font: 400 var(--text-md)/var(--line-md) var(--font-ui); }
  h1 { margin: 0; font-size: 24px; line-height: 32px; }
  h2 { margin: var(--space-8) 0 var(--space-3); font-size: var(--text-lg); line-height: var(--line-lg); }
  p { margin: var(--space-1) 0 0; color: var(--text-muted); }
  ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 400px)); gap: var(--space-6); }
  a { color: inherit; }
  li a:first-child { display: block; text-decoration: none; }
  img { display: block; width: 100%; height: auto; border-radius: var(--radius-sm); box-shadow: 0 0 0 1px var(--line); }
  li span { display: block; margin-top: var(--space-2); font-weight: 600; }
  .w { color: var(--text-muted); font-size: var(--text-sm); line-height: var(--line-sm); }
</style>
</head>
<body>
<h1>Blue Pencil: all screens</h1>
<p>Each screen is clickable: modes, tabs and recent files link to each other. Pages follow your system's light or dark setting. Save a copy always opens the save error here, so you can see that state.</p>
${groups.map(([label, names]) => `<h2>${label}</h2><ul>${names.map(card).join('')}</ul>`).join('\n')}
</body>
</html>
`);
console.log(`Built ${Object.keys(screens).length} screens for Mac and Windows`);
