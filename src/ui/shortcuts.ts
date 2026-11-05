import type { OsFamily } from '../platform';

export function shortcutLabel(os: OsFamily, key: string): string {
  return os === 'win' ? `Ctrl+${key}` : `⌘${key}`;
}
