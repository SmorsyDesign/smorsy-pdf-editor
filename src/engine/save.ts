export type OsFamily = 'mac' | 'win';

/** With no edits, a copy is the original bytes, which keeps any digital signature valid. */
export function unchangedCopy(original: Uint8Array): Uint8Array {
  return original.slice();
}

export function copyFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0) return `${fileName}-edited.pdf`;
  return `${fileName.slice(0, dot)}-edited${fileName.slice(dot)}`;
}

export function isSameFile(first: string, second: string, os: OsFamily): boolean {
  if (os === 'mac') return first === second;
  const normalise = (path: string) => path.replaceAll('\\', '/').toLowerCase();
  return normalise(first) === normalise(second);
}
