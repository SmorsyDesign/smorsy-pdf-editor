// What all four bundled handwriting fonts really contain, measured from the font files.
const COVERED: readonly (readonly [number, number])[] = [
  [0x0020, 0x007e],
  [0x00a0, 0x00ff],
  [0x0131, 0x0131],
  [0x0152, 0x0153],
  [0x02c6, 0x02c6],
  [0x02da, 0x02da],
  [0x02dc, 0x02dc],
  [0x2013, 0x2014],
  [0x2018, 0x201a],
  [0x201c, 0x201e],
  [0x2022, 0x2022],
  [0x2026, 0x2026],
  [0x2039, 0x203a],
  [0x2044, 0x2044],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
  [0x2212, 0x2212],
];

/** Letters outside this would quietly come out in a system font instead of the handwriting. */
export function handwritingCovers(text: string): boolean {
  return Array.from(text).every((character) => {
    const code = character.codePointAt(0) ?? 0;
    return COVERED.some(([from, to]) => code >= from && code <= to);
  });
}
