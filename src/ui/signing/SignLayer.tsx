import type { MouseEvent } from 'react';
import type { PageSize } from '../../engine/zoom';
import type { Signing } from './useSigning';

interface SignLayerProps {
  readonly signing: Signing;
  readonly pageNumber: number;
  readonly page: PageSize;
  readonly scale: number;
}

/** Takes clicks on the page in Sign mode: to place what's been picked, or to deselect. */
export function SignLayer({ signing, pageNumber, page, scale }: SignLayerProps) {
  const { picked } = signing;
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!picked) {
      signing.select(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    signing.place(
      picked,
      pageNumber,
      (event.clientX - bounds.left) / scale,
      (event.clientY - bounds.top) / scale,
      page,
    );
  };
  return (
    <div
      className={picked ? 'sign-layer is-placing' : 'sign-layer'}
      data-testid="sign-layer"
      onClick={onClick}
    />
  );
}
