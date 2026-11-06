import { useEffect, useState } from 'react';
import type { Color } from '../../engine/edits/model';
import { handwritingCovers } from '../../engine/signatures/handwriting';
import type { RgbaImage } from '../../engine/signatures/image';
import { cssInk, typedPixels } from './makeSignature';

const STYLES = [
  { label: 'Caveat', family: 'Sig Caveat', weight: 500 },
  { label: 'Dancing Script', family: 'Sig Dancing Script', weight: 500 },
  { label: 'Sacramento', family: 'Sig Sacramento', weight: 400 },
  { label: 'Homemade Apple', family: 'Sig Homemade Apple', weight: 400 },
] as const;

const MAX_NAME_LENGTH = 60;

interface TypeTabProps {
  readonly ink: Color;
  readonly onChange: (build: (() => Promise<RgbaImage | null>) | null) => void;
}

export function TypeTab({ ink, onChange }: TypeTabProps) {
  const [name, setName] = useState('');
  const [style, setStyle] = useState<(typeof STYLES)[number]>(STYLES[0]);
  const typed = name.trim();

  useEffect(() => {
    onChange(typed === '' ? null : () => typedPixels(typed, style, ink));
  }, [ink, onChange, style, typed]);

  return (
    <>
      <label className="field-label" htmlFor="signature-name">
        Your name
      </label>
      <input
        id="signature-name"
        className="text-input"
        maxLength={MAX_NAME_LENGTH}
        value={name}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      {!handwritingCovers(typed) && (
        <p className="foot-note signature-note" role="status">
          These styles only have Western European letters, so some of this name won’t look
          handwritten. You can draw it or upload an image instead.
        </p>
      )}
      <div className="font-options" role="radiogroup" aria-label="Handwriting style">
        {STYLES.map((option) => (
          <label key={option.family} className="font-opt">
            <input
              type="radio"
              name="signature-style"
              aria-label={option.label}
              checked={style === option}
              onChange={() => {
                setStyle(option);
              }}
            />
            <span
              className="ink"
              style={{
                color: cssInk(ink),
                fontFamily: `"${option.family}"`,
                fontWeight: option.weight,
              }}
            >
              {typed || 'Your name'}
            </span>
          </label>
        ))}
      </div>
    </>
  );
}
