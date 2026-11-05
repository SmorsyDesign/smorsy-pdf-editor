import type { OsFamily } from '../engine/save';

export function shortcutLabel(os: OsFamily, key: string): string {
  return os === 'win' ? `Ctrl+${key}` : `⌘${key}`;
}
