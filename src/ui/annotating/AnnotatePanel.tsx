import { annotationDetail, annotationLabel, type Annotation } from '../../engine/edits/annotations';
import type { PlacedSignature } from '../../engine/edits/model';
import { Icon, type IconName } from '../Icon';
import type { Signing } from '../signing/useSigning';
import type { Annotating } from './useAnnotating';

const ICONS: Readonly<Record<Annotation['kind'], IconName>> = {
  highlight: 'marker',
  underline: 'underline',
  strikeout: 'strike',
  pen: 'pen',
  rect: 'rect',
  ellipse: 'ellipse',
  arrow: 'arrow',
  note: 'pin',
  whiteout: 'whiteout',
};

interface AnnotatePanelProps {
  readonly annotating: Annotating;
  readonly signing: Signing;
  readonly annotations: readonly Annotation[];
  readonly images: readonly PlacedSignature[];
}

export function AnnotatePanel({ annotating, signing, annotations, images }: AnnotatePanelProps) {
  const total = annotations.length + images.length;
  return (
    <aside className="panel" aria-label="Annotations on this page">
      <div className="panel-head">
        <h2>On this page</h2>
        <span className="kbd">
          {total} {total === 1 ? 'annotation' : 'annotations'}
        </span>
      </div>
      {total === 0 && <p className="hint">Pick a tool, then use it on the page.</p>}
      <ul className="rows">
        {annotations.map((annotation) => {
          const label = annotationLabel(annotation);
          const detail = annotationDetail(annotation);
          return (
            <li key={annotation.id} className="row">
              <Icon name={ICONS[annotation.kind]} />
              <button
                type="button"
                className="row-text"
                onClick={() => {
                  annotating.select(annotation.id);
                }}
              >
                <span className="row-title">{label}</span>
                {detail && <span className="row-sub">{detail}</span>}
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
          );
        })}
        {images.map((image) => (
          <li key={image.id} className="row">
            <Icon name="image" />
            <button
              type="button"
              className="row-text"
              onClick={() => {
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
        ))}
      </ul>
      <div className="panel-foot">
        <p>
          Once saved, annotations can only be changed in other PDF apps, though notes can still be
          read here. Whiteout only covers what’s beneath it, so search and copy can still find it.
          Your original file stays unchanged.
        </p>
      </div>
    </aside>
  );
}
