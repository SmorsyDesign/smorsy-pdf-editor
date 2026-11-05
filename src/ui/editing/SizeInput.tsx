import { useEffect, useState } from 'react';

const MIN_SIZE = 4;
const MAX_SIZE = 144;

const shown = (size: number) => String(Math.round(size * 10) / 10);

/** Keeps what's being typed, because "1" on the way to "12" isn't a size yet. */
export function SizeInput({ size, onChange }: { size: number; onChange: (size: number) => void }) {
  const [value, setValue] = useState(shown(size));

  useEffect(() => {
    setValue(shown(size));
  }, [size]);

  return (
    <label className="fsize">
      <input
        type="number"
        aria-label="Size in points"
        min={MIN_SIZE}
        max={MAX_SIZE}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          const next = Number(event.target.value);
          if (next >= MIN_SIZE && next <= MAX_SIZE) onChange(next);
        }}
        onBlur={() => {
          setValue(shown(size));
        }}
      />
      <span aria-hidden="true">pt</span>
    </label>
  );
}
