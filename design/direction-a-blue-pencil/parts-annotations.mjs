// The annotation panel and comment parts shared by the Phase 4b screens.
import { icon } from './parts.mjs';

const swatch = (color, label, on = false) => `<button class="swatch-btn" aria-label="Colour: ${label}" aria-pressed="${on}"><span class="tool-swatch" style="background:${color}"></span></button>`;
const tool = (name, label, on = false, href = '') =>
  href
    ? `<a class="icon-btn" href="${href}" aria-label="${label}" title="${label}">${icon(name)}</a>`
    : `<button class="icon-btn" aria-label="${label}" title="${label}" aria-pressed="${on}">${icon(name)}</button>`;

export const annotateBar = (active = null) => `<div class="float-bar at-top-center" role="toolbar" aria-label="Annotation tools">
  ${tool('marker', 'Highlight', active === 'marker')}${tool('underline', 'Underline')}${tool('strike', 'Strikethrough')}<span class="sep"></span>
  ${tool('pen', 'Pen')}${tool('rect', 'Rectangle')}${tool('ellipse', 'Ellipse')}${tool('arrow', 'Arrow')}<span class="sep"></span>
  ${tool('comment', 'Comment', false, 'comment.html')}${tool('image', 'Image')}${tool('whiteout', 'Whiteout box')}<span class="sep"></span>
  ${swatch('#ffe98a', 'yellow', true)}${swatch('#a8e6b0', 'green')}${swatch('#f7b6c2', 'pink')}${swatch('#9fd4f5', 'blue')}
</div>`;

const tag = (name) => `<span class="tag">${name}</span>`;

/** One row of the list. Its tags sit under what it says, so a long list stays easy to scan. */
export const row = ({ kind, title, sub = '', words = '', tags = [], selected = false, note = '', href = kind === 'comment' ? 'comment.html' : 'annotations-tagging.html' }) => `<li class="row${selected ? ' is-selected' : ''}">${icon(kind)}<a class="row-text row-link" href="${href}">${words ? `<span class="row-words">${words}</span>` : `<span class="row-title">${title}</span>`}${sub ? `<span class="row-sub">${sub}</span>` : ''}${note ? `<span class="row-note">${note}</span>` : ''}${tags.length ? `<span class="row-tags">${tags.map(tag).join('')}</span>` : ''}</a><button class="icon-btn" aria-label="Delete ${(title || 'comment').toLowerCase()}">${icon('trash')}</button></li>`;

const TABS = [
  ['All', 'annotate.html'],
  ['Comments', 'comment.html'],
  ['Markup', 'annotations-markup.html'],
  ['Drawings', 'annotations-drawings.html'],
];

export const panelTop = ({ scope = 'page', tab = 'All', count, filters = [], on = [] }) => `<div class="panel-head"><h2>Annotations</h2><span class="kbd" role="status">${count}</span></div>
  <div class="scope" role="group" aria-label="Show annotations from">
    <a href="annotate.html" aria-current="${scope === 'page'}">This page</a>
    <a href="annotations-document.html" aria-current="${scope === 'document'}">All pages</a>
  </div>
  <div class="panel-tabs" role="tablist" aria-label="Kind of annotation">
    ${TABS.map(([name, href]) => `<a role="tab" href="${href}" aria-selected="${name === tab}">${name}</a>`).join('')}
  </div>
  ${filters.length ? `<div class="tag-filters" role="group" aria-label="Show only this tag">${filters.map((name) => `<a class="tag-btn" href="${on.includes(name) ? 'annotate.html' : 'annotations-document.html'}" aria-current="${on.includes(name)}">${name}</a>`).join('')}</div>` : ''}`;

export const pageHeading = (text) => `<li class="rows-heading">${text}</li>`;

/** A comment on the page. The square corner marks the exact spot it's about. */
export const commentPin = (x, y, open = false, color = '#ffe98a') => `<a class="comment-pin${open ? ' is-open' : ''}" href="${open ? 'annotate.html' : 'comment.html'}" style="left:${x}px;top:${y}px;background:${color}" aria-label="${open ? 'Close comment' : 'Open comment'}">${icon('comment')}</a>`;

export const commentCard = (x, y, text, editing = false) => `<div class="comment-card" style="left:${x}px;top:${y}px">${editing ? `<div class="comment-field" role="textbox" aria-label="Comment" contenteditable="true">${text}</div>` : `<p>${text}</p>`}</div>`;

/** Where tags get added: inside the selected row, so it's clear which annotation they're for. */
export const tagEditor = (tags, offers) => `<li class="tag-editor">
  <div class="tag-editing">${tags.map((name) => `<span class="tag is-removable">${name}<button aria-label="Remove tag ${name}">${icon('close')}</button></span>`).join('')}<input class="tag-input" type="text" aria-label="Add a tag" placeholder="Add a tag"></div>
  ${offers.length ? `<div class="tag-offers"><span class="kbd tag-offers-label">Used in this document</span>${offers.map((name) => `<a class="tag-btn" href="annotations-tagging.html">${name}</a>`).join('')}</div>` : ''}
</li>`;
