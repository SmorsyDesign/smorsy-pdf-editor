import type { Alignment, Color, FontId, OriginalFont, TextStyle } from '../../engine/edits/model';
import { cleanFontName } from '../../engine/fonts/match';
import { Icon, type IconName } from '../Icon';

interface FormatBarProps {
  readonly style: TextStyle;
  readonly original: OriginalFont | null;
  readonly timesAvailable: boolean;
  readonly placeBelow: boolean;
  readonly onChange: (style: TextStyle) => void;
  readonly onDelete: () => void;
}

const FONT_LABELS: readonly (readonly [FontId, string])[] = [
  ['sans', 'Liberation Sans'],
  ['serif', 'Liberation Serif'],
  ['mono', 'Liberation Mono'],
  ['carlito', 'Carlito'],
  ['caladea', 'Caladea'],
];

const ALIGNMENTS: readonly (readonly [Alignment, IconName, string])[] = [
  ['left', 'left', 'Align left'],
  ['center', 'center', 'Align centre'],
  ['right', 'right', 'Align right'],
];

const toHex = ({ r, g, b }: Color) =>
  `#${[r, g, b]
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

const fromHex = (hex: string): Color => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
});

export function FormatBar({
  style,
  original,
  timesAvailable,
  placeBelow,
  onChange,
  onDelete,
}: FormatBarProps) {
  return (
    <div
      className={placeBelow ? 'format format-below' : 'format'}
      role="toolbar"
      aria-label="Text format"
      onPointerDown={(event) => {
        // Pressing a button mustn't move focus out of the text being typed.
        if (!(
          event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement
        )) {
          event.preventDefault();
        }
      }}
    >
      <select
        className="fsel"
        aria-label="Font"
        value={style.font}
        onChange={(event) => {
          onChange({ ...style, font: event.target.value as FontId });
        }}
      >
        {original && (
          <option value="original">{cleanFontName(original.name) || 'Original font'}</option>
        )}
        {FONT_LABELS.map(([id, label]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
        {timesAvailable && <option value="times-new-roman">Times New Roman</option>}
      </select>
      <label className="fsize">
        <input
          type="number"
          aria-label="Size in points"
          min={4}
          max={144}
          value={Math.round(style.size * 10) / 10}
          onChange={(event) => {
            const size = Number(event.target.value);
            if (size >= 4 && size <= 144) onChange({ ...style, size });
          }}
        />
        <span aria-hidden="true">pt</span>
      </label>
      <span className="sep" />
      <button
        type="button"
        className="icon-btn"
        aria-label="Bold"
        aria-pressed={style.bold}
        onClick={() => {
          onChange({ ...style, bold: !style.bold });
        }}
      >
        <b>B</b>
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Italic"
        aria-pressed={style.italic}
        onClick={() => {
          onChange({ ...style, italic: !style.italic });
        }}
      >
        <em>I</em>
      </button>
      <span className="sep" />
      {ALIGNMENTS.map(([align, icon, label]) => (
        <button
          key={align}
          type="button"
          className="icon-btn"
          aria-label={label}
          aria-pressed={style.align === align}
          onClick={() => {
            onChange({ ...style, align });
          }}
        >
          <Icon name={icon} />
        </button>
      ))}
      <span className="sep" />
      <label className="swatch-label" title="Text colour">
        <input
          type="color"
          aria-label="Text colour"
          value={toHex(style.color)}
          onChange={(event) => {
            onChange({ ...style, color: fromHex(event.target.value) });
          }}
        />
      </label>
      <span className="sep" />
      <button type="button" className="icon-btn" aria-label="Delete this text" onClick={onDelete}>
        <Icon name="trash" />
      </button>
    </div>
  );
}
