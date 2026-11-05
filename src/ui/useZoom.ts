import { useCallback, useState } from 'react';
import { clampZoom, fitWidthZoom, type PageSize } from '../engine/zoom';
import { PAGE_STACK_PADDING } from './PageStack';

type ZoomState = { readonly mode: 'fit' } | { readonly mode: 'manual'; readonly percent: number };

export function useZoom(firstPage: PageSize) {
  const [zoom, setZoom] = useState<ZoomState>({ mode: 'fit' });
  const [availableWidth, setAvailableWidth] = useState(0);
  const applyZoom = useCallback((next: number) => {
    setZoom({ mode: 'manual', percent: clampZoom(next) });
  }, []);
  const fit = useCallback(() => {
    setZoom({ mode: 'fit' });
  }, []);
  return {
    percent:
      zoom.mode === 'manual'
        ? zoom.percent
        : fitWidthZoom(firstPage, availableWidth - PAGE_STACK_PADDING * 2),
    fitting: zoom.mode === 'fit',
    measured: availableWidth > 0,
    setAvailableWidth,
    applyZoom,
    fit,
  };
}
