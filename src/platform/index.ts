import type { Platform } from './types';

export async function createPlatform(): Promise<Platform> {
  if ('__TAURI_INTERNALS__' in window) {
    const { createTauriPlatform } = await import('./tauri');
    return createTauriPlatform();
  }
  // The mock is removed from production builds, so the shipped app can't fall back to it.
  if (import.meta.env.DEV) {
    const { createMockPlatform } = await import('./mock');
    return createMockPlatform();
  }
  throw new Error('Smorsy PDF Editor must run as the desktop app.');
}

export type { MenuCommand, OpenedFile, OsFamily, Platform, SaveFailureKind } from './types';
export { ReadFailure, SaveFailure } from './types';
