import { Fragment } from 'react';
import {
  annotationCategory,
  annotationDetail,
  annotationLabel,
  canTag,
  type Annotation,
} from '../../engine/edits/annotations';
import type { PlacedSignature } from '../../engine/edits/model';
import { Icon, type IconName } from '../Icon';
import type { Signing } from '../signing/useSigning';
import { TagEditor } from './TagEditor';
import type { Annotating } from './useAnnotating';
import { useAnnotationList, type ListScope, type ListTab } from './useAnnotationList';

const ICONS: Readonly<Record<Exclude<Annotation['kind'], 'foreign'>, IconName>> = {
  highlight: 'marker',
  underline: 'underline',
  strikeout: 'strike',
  pen: 'pen',
  rect: 'rect',
  ellipse: 'ellipse',
  arrow: 'arrow',
  comment: 'comment',
  whiteout: 'whiteout',
};

const iconOf = (annotation: Annotation): IconName => {
  if (annotation.kind !== 'foreign') return ICONS[annotation.kind];
  return annotationCategory(annotation) === 'markup' ? 'marker' : 'pen';
};

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
  readonly onGoTo: (pageNumber: number, y: number) => void;
}

function foreignNote(annotation: Annotation): string {
  return annotation.kind === 'comment'
    ? 'Made in another app. You can change its words and tags, or delete it.'
    : 'Made in another app. You can change its tags, or delete it.';
}

export function AnnotatePanel({
  annotating,
  signing,
  images,
  currentPage,
  onGoTo,
}: AnnotatePanelProps) {
  const { selected } = annotating;
  const list = useAnnotationList(annotating.saved, images, currentPage, selected);
  const { scope, tab, tag, items, total } = list;
  const filtered = tab !== 'all' || tag !== null;
  const tabName = TABS.find(([value]) => value === tab)?.[2] ?? 'annotations';
  const where = scope === 'page' ? 'on this page' : 'in this document';
  const editing = selected !== null && canTag(selected);

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
      {items.length === 0 && (
        <p className="hint">
          {tag !== null
            ? `Nothing tagged “${tag}” ${where}.`
            : filtered
              ? `No ${tabName} ${where}.`
              : scope === 'page'
                ? 'Pick a tool, then use it on the page.'
                : 'Nothing yet. Pick a tool, then use it on a page.'}
        </p>
      )}
      <ul className="rows">
        {items.map((item, index) => {
          const pageNumber = list.pageOf(item);
          const previous = items[index - 1];
          const startsPage = scope === 'all' && (!previous || list.pageOf(previous) !== pageNumber);
          const heading = startsPage ? <li className="rows-heading">Page {pageNumber}</li> : null;
          if (item.type === 'image') {
            return (
              <Fragment key={item.id}>
                {heading}
                <li className={signing.selected?.id === item.id ? 'row is-selected' : 'row'}>
                  <Icon name="image" />
                  <button
                    type="button"
                    className="row-text"
                    onClick={() => {
                      annotating.clearTool();
                      if (scope === 'all') onGoTo(pageNumber, item.image.rect.y);
                      signing.select(item.id);
                    }}
                  >
                    <span className="row-title">Image</span>
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Delete image"
                    onClick={() => {
                      signing.remove(item.id);
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                </li>
              </Fragment>
            );
          }
          const { annotation } = item;
          const label = annotationLabel(annotation);
          const detail = annotationDetail(annotation);
          const isSelected = selected?.id === annotation.id;
          const tags = annotation.tags ?? [];
          return (
            <Fragment key={item.id}>
              {heading}
              <li className={isSelected ? 'row is-selected' : 'row'}>
                <Icon name={iconOf(annotation)} />
                <button
                  type="button"
                  className="row-text"
                  onClick={() => {
                    annotating.goTo(annotation);
                    if (scope === 'all') onGoTo(pageNumber, annotating.topOf(annotation));
                  }}
                >
                  {annotation.kind === 'comment' ? (
                    <span className="row-words">{detail}</span>
                  ) : (
                    <>
                      <span className="row-title">{label}</span>
                      {detail && <span className="row-sub">{detail}</span>}
                    </>
                  )}
                  {isSelected && annotation.saved?.foreign && (
                    <span className="row-note">{foreignNote(annotation)}</span>
                  )}
                  {!isSelected && tags.length > 0 && (
                    <span className="row-tags">
                      {tags.map((one) => (
                        <span key={one} className="tag">
                          {one}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Delete ${label.toLowerCase()}`}
                  onClick={() => {
                    annotating.remove(annotation.id);
                  }}
                >
                  <Icon name="trash" />
                </button>
              </li>
              {isSelected && canTag(annotation) && (
                <TagEditor
                  tags={tags}
                  offers={list.tags}
                  onChange={(next) => {
                    annotating.change({ ...annotation, tags: next });
                  }}
                />
              )}
            </Fragment>
          );
        })}
      </ul>
      <div className="panel-foot">
        <p>{foot}</p>
      </div>
    </aside>
  );
}
