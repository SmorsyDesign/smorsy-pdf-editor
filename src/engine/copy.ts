/** With no edits, a copy is the original bytes, which keeps any digital signature valid. */
export function unchangedCopy(original: Uint8Array): Uint8Array {
  return original.slice();
}

export function copyFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return `${fileName}-edited.pdf`;
  return `${fileName.slice(0, dot)}-edited${fileName.slice(dot)}`;
}

/** Page numbers as a person would write them: runs joined with a dash, the rest with commas. */
function pageList(positions: ReadonlySet<number>): string {
  const sorted = [...positions].sort((one, two) => one - two);
  const runs: string[] = [];
  let start = sorted[0];
  let previous = start;
  for (const position of [...sorted.slice(1), Infinity]) {
    if (start === undefined || previous === undefined) break;
    if (position === previous + 1) {
      previous = position;
      continue;
    }
    runs.push(start === previous ? String(start) : `${String(start)}–${String(previous)}`);
    start = position;
    previous = position;
  }
  return runs.join(', ');
}

/** Names a file of some pages after the document and which pages they are. */
export function extractFileName(fileName: string, positions: ReadonlySet<number>): string {
  const dot = fileName.lastIndexOf('.');
  const stem = dot <= 0 ? fileName : fileName.slice(0, dot);
  const which = positions.size === 1 ? 'page' : 'pages';
  return `${stem} (${which} ${pageList(positions)}).pdf`;
}
