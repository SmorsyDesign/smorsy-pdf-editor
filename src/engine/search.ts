import type { Rect } from './edits/model';
import type { TextBlock } from './extract';

export interface SearchMatch {
  readonly pageNumber: number;
  readonly rect: Rect;
  readonly angle: number;
}

/** Positions are estimated from character counts, which is close enough to mark a word. */
export function findMatches(blocks: readonly TextBlock[], query: string): readonly SearchMatch[] {
  const wanted = query.trim().toLowerCase();
  if (wanted === '') return [];

  const matches: SearchMatch[] = [];
  for (const block of blocks) {
    const radians = (block.angle * Math.PI) / 180;
    for (const line of block.lines) {
      const text = line.text.toLowerCase();
      const widthOfCharacter = line.rect.width / (text.length || 1);
      for (
        let at = text.indexOf(wanted);
        at !== -1;
        at = text.indexOf(wanted, at + wanted.length)
      ) {
        const offset = at * widthOfCharacter;
        matches.push({
          pageNumber: block.pageNumber,
          angle: block.angle,
          rect: {
            x: line.rect.x + Math.cos(radians) * offset,
            y: line.rect.y + Math.sin(radians) * offset,
            width: wanted.length * widthOfCharacter,
            height: line.rect.height,
          },
        });
      }
    }
  }
  return matches;
}
