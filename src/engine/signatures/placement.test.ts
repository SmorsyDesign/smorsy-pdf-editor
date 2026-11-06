import { describe, expect, it } from 'vitest';
import { displayToUser, type PageBox } from '../coordinates';
import {
  dateStampBox,
  formatStampDate,
  newPlacementRect,
  placementInPdf,
  resizeFromCorner,
  turnedBy,
  angleToPoint,
  keptOnPage,
  movedRect,
  scaledRect,
} from './placement';

const LETTER = { width: 612, height: 792 };

describe('newPlacementRect', () => {
  it('centres on the chosen point, keeping the image’s shape', () => {
    expect(newPlacementRect(300, 400, 168, 2, LETTER)).toEqual({
      x: 216,
      y: 358,
      width: 168,
      height: 84,
    });
  });

  it('keeps it on the page when placed near an edge', () => {
    const rect = newPlacementRect(5, 785, 168, 2, LETTER);
    expect(rect.x).toBe(0);
    expect(rect.y + rect.height).toBe(792);
  });

  it('shrinks to fit a page smaller than the signature', () => {
    const rect = newPlacementRect(50, 50, 168, 2, { width: 100, height: 100 });
    expect(rect.width).toBe(100);
    expect(rect.height).toBe(50);
  });

  it('shrinks a tall image to fit the page height', () => {
    const rect = newPlacementRect(50, 50, 168, 0.1, { width: 200, height: 100 });
    expect(rect.height).toBe(100);
    expect(rect.width).toBeCloseTo(10);
  });
});

describe('resizeFromCorner', () => {
  const rect = { x: 100, y: 100, width: 200, height: 100 };

  it('grows from the bottom right, leaving the top left where it was', () => {
    const next = resizeFromCorner(rect, 0, 'bottom-right', 40, 20, 24);
    expect(next.width).toBeCloseTo(240);
    expect(next.height).toBeCloseTo(120);
    expect(next.x).toBeCloseTo(100);
    expect(next.y).toBeCloseTo(100);
  });

  it('grows from the top left, leaving the bottom right where it was', () => {
    const next = resizeFromCorner(rect, 0, 'top-left', -40, -20, 24);
    expect(next.width).toBeCloseTo(240);
    expect(next.x + next.width).toBeCloseTo(300);
    expect(next.y + next.height).toBeCloseTo(200);
  });

  it('always keeps the signature’s shape', () => {
    const next = resizeFromCorner(rect, 0, 'bottom-right', 90, 3, 24);
    expect(next.width / next.height).toBeCloseTo(2);
  });

  it('stops at the smallest size', () => {
    expect(resizeFromCorner(rect, 0, 'bottom-right', -500, -500, 24).width).toBe(24);
  });

  it('follows the corner when the signature is turned', () => {
    // Turned a quarter clockwise, its bottom right corner sits at the screen's bottom left.
    const next = resizeFromCorner(rect, 90, 'bottom-right', -20, 40, 24);
    expect(next.width).toBeCloseTo(240);
    // That corner's opposite stays where it was on screen, at centre + rotated (-100, -50).
    const opposite = { x: 200 + 50, y: 150 - 100 };
    const centre = { x: next.x + next.width / 2, y: next.y + next.height / 2 };
    expect(centre.x + next.height / 2).toBeCloseTo(opposite.x);
    expect(centre.y - next.width / 2).toBeCloseTo(opposite.y);
  });
});

describe('turnedBy', () => {
  it('wraps around a full turn', () => {
    expect(turnedBy(270, 90)).toBe(0);
    expect(turnedBy(0, -90)).toBe(270);
    expect(turnedBy(359.5, 1)).toBeCloseTo(0.5);
  });
});

describe('keptOnPage', () => {
  it('leaves what’s already on the page alone', () => {
    const rect = { x: 100, y: 100, width: 200, height: 100 };
    expect(keptOnPage(rect, 0, LETTER)).toEqual(rect);
  });

  it('brings back anything past an edge', () => {
    const next = keptOnPage({ x: -50, y: 760, width: 200, height: 100 }, 0, LETTER);
    expect(next.x).toBe(0);
    expect(next.y + next.height).toBe(792);
  });

  it('allows for the space a turned signature really takes up', () => {
    // Turned a quarter, this is 100 wide and 200 tall around its middle.
    const next = keptOnPage({ x: 0, y: 0, width: 200, height: 100 }, 90, LETTER);
    const middle = { x: next.x + next.width / 2, y: next.y + next.height / 2 };
    expect(middle.x).toBeCloseTo(100);
    expect(middle.y).toBeCloseTo(100);
  });

  it('shrinks what can’t fit at all, keeping its shape', () => {
    const next = keptOnPage({ x: 0, y: 0, width: 1000, height: 100 }, 0, LETTER);
    expect(next.width).toBeCloseTo(612);
    expect(next.height).toBeCloseTo(61.2);
  });
});

describe('movedRect', () => {
  const rect = { x: 100, y: 100, width: 200, height: 100 };

  it('moves by what was dragged', () => {
    expect(movedRect(rect, 0, 10, -20, LETTER)).toEqual({ ...rect, x: 110, y: 80 });
  });

  it('stops at the page’s edge, because the file would cut off anything past it', () => {
    const next = movedRect(rect, 0, -5000, 5000, LETTER);
    expect(next.x).toBe(0);
    expect(next.y + next.height).toBe(792);
  });
});

describe('scaledRect', () => {
  const rect = { x: 100, y: 100, width: 200, height: 100 };

  it('grows around the middle, keeping the shape', () => {
    expect(scaledRect(rect, 0, 1.5, 24, LETTER)).toEqual({
      x: 50,
      y: 75,
      width: 300,
      height: 150,
    });
  });

  it('stops at the smallest size', () => {
    expect(scaledRect(rect, 0, 0.01, 24, LETTER).width).toBe(24);
  });

  it('stays on the page', () => {
    const next = scaledRect({ x: 500, y: 700, width: 100, height: 50 }, 0, 3, 24, LETTER);
    expect(next.x + next.width).toBeLessThanOrEqual(612);
    expect(next.y + next.height).toBeLessThanOrEqual(792);
  });
});

describe('angleToPoint', () => {
  it('reads straight up as upright, because the handle sits above the signature', () => {
    expect(angleToPoint(0, -100)).toBe(0);
  });

  it('reads the right as a quarter turn clockwise', () => {
    expect(angleToPoint(100, 0)).toBe(90);
  });

  it('settles on a quarter turn when close', () => {
    expect(angleToPoint(100, 3)).toBe(90);
    expect(angleToPoint(3, -100)).toBe(0);
    expect(angleToPoint(-3, -100)).toBe(0);
  });

  it('otherwise follows the pointer in whole degrees', () => {
    expect(angleToPoint(100, -100)).toBe(45);
  });
});

describe('placementInPdf', () => {
  const rect = { x: 100, y: 200, width: 120, height: 60 };
  const box = (rotation: number, unit = 1): PageBox => ({
    x: 0,
    y: 0,
    width: rotation % 180 === 0 ? 612 : 792,
    height: rotation % 180 === 0 ? 792 : 612,
    rotation,
    unit,
  });

  /** Where the middle of the image ends up, from its lower-left corner, size and rotation. */
  function middleOf(placed: ReturnType<typeof placementInPdf>) {
    const radians = (placed.rotate * Math.PI) / 180;
    const across = { x: placed.width / 2, y: placed.height / 2 };
    return {
      x: placed.x + across.x * Math.cos(radians) - across.y * Math.sin(radians),
      y: placed.y + across.x * Math.sin(radians) + across.y * Math.cos(radians),
    };
  }

  for (const rotation of [0, 90, 180, 270]) {
    for (const angle of [0, 30, 90, 200]) {
      it(`keeps the middle in place on a page turned ${rotation}, signature turned ${angle}`, () => {
        const page = box(rotation);
        const placed = placementInPdf(rect, angle, page);
        const expected = displayToUser({ x: 160, y: 230 }, page);
        const middle = middleOf(placed);
        expect(middle.x).toBeCloseTo(expected.x);
        expect(middle.y).toBeCloseTo(expected.y);
        expect(placed.width).toBe(120);
        expect(placed.height).toBe(60);
      });
    }
  }

  it('draws upright on an unrotated page at its lower-left corner', () => {
    expect(placementInPdf(rect, 0, box(0))).toEqual({
      x: 100,
      y: 792 - 260,
      width: 120,
      height: 60,
      rotate: 0,
    });
  });

  it('scales down on a page with a larger unit', () => {
    const placed = placementInPdf(rect, 0, box(0, 2));
    expect(placed.width).toBe(60);
    expect(placed.height).toBe(30);
  });
});

describe('the date stamp', () => {
  const signature = { x: 100, y: 200, width: 168, height: 56 };
  const ink = { r: 0.1, g: 0.2, b: 0.4 };
  const day = new Date(2026, 10, 5);

  it('writes the date out in words', () => {
    expect(formatStampDate(day)).toBe('November 5, 2026');
  });

  it('sits beside the signature, level with its bottom', () => {
    const stamp = dateStampBox('stamp', 1, signature, 0, LETTER, ink, day);
    expect(stamp.text).toBe('November 5, 2026');
    expect(stamp.rect.x).toBe(280);
    expect(stamp.rect.y + stamp.rect.height).toBeCloseTo(256);
    expect(stamp.style.color).toEqual(ink);
    expect(stamp.covers).toEqual([]);
    expect(stamp.original).toBeNull();
  });

  it('goes underneath when there’s no room beside it', () => {
    const stamp = dateStampBox('stamp', 1, { ...signature, x: 400 }, 0, LETTER, ink, day);
    expect(stamp.rect.x).toBe(400);
    expect(stamp.rect.y).toBe(260);
  });

  it('stays on the page at the bottom right corner', () => {
    const corner = { x: 440, y: 736, width: 172, height: 56 };
    const stamp = dateStampBox('stamp', 1, corner, 0, LETTER, ink, day);
    expect(stamp.rect.x + stamp.rect.width).toBeLessThanOrEqual(612);
    expect(stamp.rect.y + stamp.rect.height).toBeLessThanOrEqual(792);
  });

  it('never lands on the signature, even in the bottom right corner', () => {
    const corner = { x: 440, y: 742, width: 172, height: 50 };
    const stamp = dateStampBox('stamp', 1, corner, 0, LETTER, ink, day);
    expect(stamp.rect.y + stamp.rect.height).toBeLessThanOrEqual(corner.y);
  });

  it('goes to the left if that’s the only room there is', () => {
    const page = { width: 612, height: 60 };
    const tall = { x: 480, y: 0, width: 132, height: 60 };
    const stamp = dateStampBox('stamp', 1, tall, 0, page, ink, day);
    expect(stamp.rect.x + stamp.rect.width).toBeLessThanOrEqual(tall.x);
  });

  it('allows for a turned signature, using the space it really takes up', () => {
    const stamp = dateStampBox('stamp', 1, signature, 90, LETTER, ink, day);
    // Upright it would reach x = 268. Turned, it's 56 wide around the same middle, ending at 212.
    expect(stamp.rect.x).toBe(224);
  });
});
