import { Fragment } from 'react';
import { canTag } from '../../engine/edits/annotations';
import type { PlacedSignature } from '../../engine/edits/model';
import type { Signing } from '../signing/useSigning';
import { AnnotationRow, ImageRow } from './AnnotationRow';
import type { Annotating } from './useAnnotating';
import { useAnnotationList, type ListScope, type ListTab } from './useAnnotationList';

const TABS: readonly (readonly [ListTab, string, string])[] = [
  ['all', 'All', 'annotations'],
  ['comment', 'Comments', 'comments'],
  ['markup', 'Markup', 'markup'],
  ['drawing', 'Drawings', 'drawings'],
];

const SCOPES: readonly (readonly [ListScope, string])[] = [
  ['page', 'This page'],
  ['all', 'All pages'],
];

const IMAGE_AND_WHITEOUT_LIMIT =
  'Images and whiteout boxes become part of the page when saved, so they can’t be changed after that. Whiteout only covers what’s beneath it, so search and copy can still find it.';

interface AnnotatePanelProps {
  readonly annotating: Annotating;
  readonly signing: Signing;
  readonly images: readonly PlacedSignature[];
  readonly currentPage: number;
  /** How many annotations in the file can't be listed here. */
  readonly unread: number;
  readonly onGoTo: (pageNumber: number, y: number) => void;
}

export function AnnotatePanel({
  annotating,
  signing,
  images,
  currentPage,
  unread,
  onGoTo,
}: AnnotatePanelProps) {
  const { selected } = annotating;
  const list = useAnnotationList(annotating.listed, images, currentPage, selected);
  const { scope, tab, tag, items, total } = list;
  const filtered = tab !== 'all' || tag !== null;
  const tabName = TABS.find(([value]) => value === tab)?.[2] ?? 'annotations';
  const where = scope === 'page' ? 'on this page' : 'in this document';
  const editing = selected !== null && canTag(selected);

  let emptyHint =
    scope === 'page'
      ? 'Pick a tool, then use it on the page.'
      : 'Nothing yet. Pick a tool, then use it on a page.';
  if (tag !== null) {
    emptyHint = `Nothing tagged “${tag}” ${where}.`;
  } else if (filtered) {
    emptyHint = `No ${tabName} ${where}.`;
  }

  let foot = `${IMAGE_AND_WHITEOUT_LIMIT} Your original file stays unchanged.`;
  if (editing) {
    foot =
      'Tags are saved in the file, but only this app shows them. Your original file stays unchanged.';
  } else if (tab === 'comment') {
    foot = 'Comments show in other PDF apps too. Your original file stays unchanged.';
  }

  return (
    <aside className="panel" aria-label="Annotations">
      <div className="panel-head">
        <h2>Annotations</h2>
        <span className="kbd" role="status">
          {filtered
            ? `${String(items.length)} of ${String(total)}`
            : `${String(total)} ${total === 1 ? 'annotation' : 'annotations'}`}
        </span>
      </div>
      <div className="scope" role="group" aria-label="Show annotations from">
        {SCOPES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={scope === value}
            onClick={() => {
              list.setScope(value);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="panel-tabs" role="group" aria-label="Kind of annotation">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => {
              list.setTab(value);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {list.tags.length > 0 && (
        <div className="tag-filters" role="group" aria-label="Show only this tag">
          {list.tags.map((name) => (
            <button
              key={name}
              type="button"
              className="tag-btn"
              aria-pressed={tag === name}
              onClick={() => {
                list.toggleTag(name);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      {items.length === 0 && <p className="hint">{emptyHint}</p>}
      <ul className="rows">
        {items.map((item, index) => {
          const pageNumber = list.pageOf(item);
          const previous = items[index - 1];
          const startsPage = scope === 'all' && (!previous || list.pageOf(previous) !== pageNumber);
          const rowProps = {
            annotating,
            signing,
            bringIntoView: (y: number) => {
              if (scope === 'all') onGoTo(pageNumber, y);
            },
          };
          return (
            <Fragment key={item.id}>
              {startsPage && <li className="rows-heading">Page {pageNumber}</li>}
              {item.type === 'image' ? (
                <ImageRow image={item.image} {...rowProps} />
              ) : (
                <AnnotationRow annotation={item.annotation} tagOffers={list.tags} {...rowProps} />
              )}
            </Fragment>
          );
        })}
      </ul>
      <div className="panel-foot">
        {unread > 0 && (
          <p>
            {unread === 1
              ? 'One more annotation in this file can’t be listed or changed here.'
              : `${String(unread)} more annotations in this file can’t be listed or changed here.`}
          </p>
        )}
        <p>{foot}</p>
      </div>
    </aside>
  );
}
