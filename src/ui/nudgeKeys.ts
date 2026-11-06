/** How far an arrow key moves something on the page, in points. Shift moves it a finer step. */
export const KEY_STEP = 4;
export const FINE_KEY_STEP = 1;

export const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
