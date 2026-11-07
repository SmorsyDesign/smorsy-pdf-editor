import { annotationCategory, annotationLabel } from '../../engine/edits/annotation-labels';
import { boundsOfAnnotation, canTag, type Annotation } from '../../engine/edits/annotations';
import type { PlacedSignature } from '../../engine/edits/model';
import { Icon, type IconName } from '../Icon';
import type { Signing } from '../signing/useSigning';
import { TagEditor } from './TagEditor';
import type { Annotating } from './useAnnotating';

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

function foreignLimit(annotation: Annotation): string {
  return annotation.kind === 'comment'
    ? 'Made in another app. You can change its words and tags, or delete it.'
    : 'Made in another app. You can change its tags, or delete it.';
}

interface RowProps {
  readonly annotating: Annotating;
  readonly signing: Signing;
  /** Brings a height on the row's page into view, when the list reaches beyond this page. */
  readonly bringIntoView: (y: number) => void;
}

interface ImageRowProps extends RowProps {
  readonly image: PlacedSignature;
}

export function ImageRow({ image, annotating, signing, bringIntoView }: ImageRowProps) {
  return (
    <li className={signing.selected?.id === image.id ? 'row is-selected' : 'row'}>
      <Icon name="image" />
      <button
        type="button"
        className="row-text"
        onClick={() => {
          annotating.clearTool();
          annotating.select(null);
          bringIntoView(image.rect.y);
          signing.select(image.id);
        }}
      >
        <span className="row-title">Image</span>
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Delete image"
        onClick={() => {
          signing.remove(image.id);
        }}
      >
        <Icon name="trash" />
      </button>
    </li>
  );
}

interface AnnotationRowProps extends RowProps {
  readonly annotation: Annotation;
  /** Every tag in use, to offer while this one's being tagged. */
  readonly tagOffers: readonly string[];
}

export function AnnotationRow({
  annotation,
  tagOffers,
  annotating,
  signing,
  bringIntoView,
}: AnnotationRowProps) {
  const label = annotationLabel(annotation);
  const words = 'text' in annotation ? annotation.text : '';
  const isSelected = annotating.selected?.id === annotation.id;
  const tags = annotation.tags ?? [];
  return (
    <>
      <li className={isSelected ? 'row is-selected' : 'row'}>
        <Icon name={iconOf(annotation)} />
        <button
          type="button"
          className="row-text"
          {...(isSelected ? { 'aria-current': true } : {})}
          onClick={() => {
            signing.select(null);
            annotating.goTo(annotation);
            bringIntoView(boundsOfAnnotation(annotation).y);
          }}
        >
          {annotation.kind === 'comment' ? (
            <span className="row-words">{words || 'Comment with no words'}</span>
          ) : (
            <>
              <span className="row-title">{label}</span>
              {words && <span className="row-sub">{words}</span>}
            </>
          )}
          {isSelected && annotation.saved?.foreign && (
            <span className="row-note">{foreignLimit(annotation)}</span>
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
          offers={tagOffers}
          onChange={(next) => {
            annotating.change({ ...annotation, tags: next });
          }}
        />
      )}
    </>
  );
}
