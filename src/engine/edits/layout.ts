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
  for (const word of paragraph.split(/ +/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (measure(word) <= maxWidth) {
      line = word;
    } else {
      const pieces = breakLongWord(word, maxWidth, measure);
      line = pieces.pop() ?? '';
      lines.push(...pieces);
    }
  }
  lines.push(line);
  return lines;
}

export function wrapText(text: string, maxWidth: number, measure: MeasureText): string[] {
  if (text === '') return [];
  return text.split('\n').flatMap((paragraph) => wrapParagraph(paragraph, maxWidth, measure));
}
