import type { MouseEvent } from 'react';
import type { PageSize } from '../../engine/zoom';
import type { Signing } from './useSigning';

interface SignLayerProps {
  readonly signing: Signing;
  readonly pageNumber: number;
  readonly page: PageSize;
  readonly scale: number;
}

/** Takes clicks on the page in Sign mode: to place or move a signature, or to deselect. */
export function SignLayer({ signing, pageNumber, page, scale }: SignLayerProps) {
  const { picked, moving } = signing;
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / scale;
    const y = (event.clientY - bounds.top) / scale;
    if (picked) signing.place(picked, pageNumber, x, y, page);
    else if (moving) signing.moveHere(moving, pageNumber, x, y, page);
    else signing.select(null);
  };
  return (
    <div
      className={picked || moving ? 'sign-layer is-placing' : 'sign-layer'}
      data-testid="sign-layer"
      onClick={onClick}
    />
  );
}
