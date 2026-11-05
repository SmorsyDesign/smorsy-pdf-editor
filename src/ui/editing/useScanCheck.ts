import { useEffect, useState } from 'react';
import type { PageText } from '../../engine/extract';
import type { EditorMode } from '../TopBar';

/** A scan explains itself as soon as it's in view in Edit text. */
export function useScanCheck(
  mode: EditorMode,
  pageNumber: number,
  pageText: (pageNumber: number) => Promise<PageText>,
) {
  const [scanned, setScanned] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (mode !== 'edit') {
      setScanned(false);
      return;
    }
    let cancelled = false;
    setDismissed(false);
    pageText(pageNumber)
      .then((result) => {
        if (!cancelled) setScanned(result.scanned);
      })
      .catch((error: unknown) => {
        console.error(error);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, pageNumber, pageText]);

  return {
    showScanCard: scanned && !dismissed && mode === 'edit',
    dismissScanCard: () => {
      setDismissed(true);
    },
  };
}
