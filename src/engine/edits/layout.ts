export type MeasureText = (text: string) => number;

function breakLongWord(word: string, maxWidth: number, measure: MeasureText): string[] {
  const pieces: string[] = [];
  let piece = '';
  for (const character of word) {
    if (piece && measure(piece + character) > maxWidth) {
      pieces.push(piece);
      piece = character;
    } else {
      piece += character;
    }
  }
  if (piece) pieces.push(piece);
  return pieces;
}

function wrapParagraph(paragraph: string, maxWidth: number, measure: MeasureText): string[] {
  const lines: string[] = [];
  let line = '';
  // Spaces are kept as typed, because people use runs of them to line things up.
  for (const piece of paragraph.match(/ +|[^ ]+/g) ?? []) {
    const candidate = line + piece;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line.trimEnd()) lines.push(line.trimEnd());
    if (piece.startsWith(' ')) {
      // Spaces that fall at a line break disappear, as they do in any text editor.
      line = '';
    } else if (measure(piece) <= maxWidth) {
      line = piece;
    } else {
      const parts = breakLongWord(piece, maxWidth, measure);
      line = parts.pop() ?? '';
      lines.push(...parts);
    }
  }
  if (line || lines.length === 0) lines.push(line);
  return lines;
}

export function wrapText(text: string, maxWidth: number, measure: MeasureText): string[] {
  if (text === '') return [];
  return text.split('\n').flatMap((paragraph) => wrapParagraph(paragraph, maxWidth, measure));
}
