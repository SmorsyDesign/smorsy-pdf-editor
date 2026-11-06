// What the bundled handwriting fonts cover: Western European letters and common punctuation.
const COVERED: readonly (readonly [number, number])[] = [
  [0x0000, 0x00ff],
  [0x0131, 0x0131],
  [0x0152, 0x0153],
  [0x02bb, 0x02bc],
  [0x02c6, 0x02c6],
  [0x02da, 0x02da],
  [0x02dc, 0x02dc],
  [0x2000, 0x206f],
  [0x20ac, 0x20ac],
  [0x2122, 0x2122],
];

/** Letters outside this would quietly come out in a system font instead of the handwriting. */
export function handwritingCovers(text: string): boolean {
  return Array.from(text).every((character) => {
    const code = character.codePointAt(0) ?? 0;
    return COVERED.some(([from, to]) => code >= from && code <= to);
  });
}
