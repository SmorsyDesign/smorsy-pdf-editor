import type { MouseEvent } from 'react';
import { Icon, type IconName } from '../Icon';
import { cssInk } from '../signing/makeSignature';
import { SWATCHES, isMarkupTool, type AnnotationTool, type Annotating } from './useAnnotating';

/** Image isn't a tool you draw with: it asks for a file straight away. */
const IMAGE = 'image';

const TOOLS: readonly (readonly (readonly [AnnotationTool | typeof IMAGE, IconName, string])[])[] =
  [
    [
      ['highlight', 'marker', 'Highlight'],
      ['underline', 'underline', 'Underline'],
      ['strikeout', 'strike', 'Strikethrough'],
    ],
    [
      ['pen', 'pen', 'Pen'],
      ['rect', 'rect', 'Rectangle'],
      ['ellipse', 'ellipse', 'Ellipse'],
      ['arrow', 'arrow', 'Arrow'],
    ],
    [
      ['comment', 'comment', 'Comment'],
      [IMAGE, 'image', 'Image'],
      ['whiteout', 'whiteout', 'Whiteout box'],
    ],
  ];

interface AnnotateBarProps {
  readonly annotating: Annotating;
  readonly currentPage: number;
  readonly centre: { readonly x: number; readonly y: number };
  readonly onChooseImage: () => void;
}

export function AnnotateBar({ annotating, currentPage, centre, onChooseImage }: AnnotateBarProps) {
  const pick = (event: MouseEvent, tool: AnnotationTool | typeof IMAGE) => {
    if (tool === IMAGE) {
      onChooseImage();
      return;
    }
    annotating.pickTool(tool);
    // From the keyboard there's no pointer to place with. Marks and the pen are handled elsewhere.
    if (event.detail === 0 && !isMarkupTool(tool) && tool !== 'pen') {
      annotating.placeAt(tool, currentPage, centre, true);
      annotating.clearTool();
    }
  };

  return (
    <div className="float-bar at-top-center" role="toolbar" aria-label="Annotation tools">
      {TOOLS.map((group, index) => (
        <span key={index} className="tool-group">
          {index > 0 && <span className="sep" />}
          {group.map(([tool, icon, label]) => (
            <button
              key={tool}
              type="button"
              className="icon-btn"
              aria-label={label}
              title={label}
              {...(tool === IMAGE ? {} : { 'aria-pressed': annotating.tool === tool })}
              onClick={(event) => {
                pick(event, tool);
              }}
            >
              <Icon name={icon} />
            </button>
          ))}
        </span>
      ))}
      <span className="sep" />
      {SWATCHES.map((swatch) => (
        <button
          key={swatch.name}
          type="button"
          className="swatch-btn"
          aria-label={`Colour: ${swatch.name}`}
          aria-pressed={annotating.swatch === swatch}
          onClick={() => {
            annotating.pickSwatch(swatch);
          }}
        >
          <span className="tool-swatch" style={{ background: cssInk(swatch.marker) }} />
        </button>
      ))}
    </div>
  );
}
