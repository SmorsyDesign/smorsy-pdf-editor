import { describe, expect, it } from 'vitest';
import {
  identityLayout,
  isIdentity,
  keepPages,
  movePages,
  positionOf,
  removePages,
  turnPages,
} from './layout';

const sources = (layout: ReturnType<typeof identityLayout>) => layout.map((slot) => slot.source);
const five = identityLayout(5);

describe('arranging pages', () => {
  it('starts with every page in its place, unturned', () => {
    expect(sources(five)).toEqual([1, 2, 3, 4, 5]);
    expect(isIdentity(five)).toBe(true);
  });

  it('turns the chosen pages either way, and wraps round', () => {
    const turned = turnPages(five, new Set([2, 4]), 1);
    expect(turned.map((slot) => slot.turns)).toEqual([0, 1, 0, 1, 0]);
    expect(turnPages(turned, new Set([2]), -1)[1]?.turns).toBe(0);
    expect(turnPages(five, new Set([1]), -1)[0]?.turns).toBe(3);
    expect(isIdentity(turned)).toBe(false);
  });

  it('removes the chosen pages, but never every one', () => {
    expect(sources(removePages(five, new Set([2, 5])))).toEqual([1, 3, 4]);
    expect(() => removePages(five, new Set([1, 2, 3, 4, 5]))).toThrow('at least one page');
  });

  it('moves pages forward and back, keeping their order', () => {
    expect(sources(movePages(five, new Set([4, 5]), 1))).toEqual([4, 5, 1, 2, 3]);
    expect(sources(movePages(five, new Set([1, 2]), 5))).toEqual([3, 4, 1, 2, 5]);
    expect(sources(movePages(five, new Set([1]), 6))).toEqual([2, 3, 4, 5, 1]);
    expect(sources(movePages(five, new Set([2, 4]), 4))).toEqual([1, 3, 2, 4, 5]);
  });

  it('leaves the order alone when pages are dropped where they are', () => {
    expect(sources(movePages(five, new Set([3]), 3))).toEqual([1, 2, 3, 4, 5]);
    expect(sources(movePages(five, new Set([3]), 4))).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps just the chosen pages, for a new file', () => {
    expect(sources(keepPages(five, new Set([4, 2])))).toEqual([2, 4]);
    expect(() => keepPages(five, new Set())).toThrow('at least one');
  });

  it('says where a page of the file is now', () => {
    const moved = movePages(five, new Set([5]), 1);
    expect(positionOf(moved, 5)).toBe(1);
    expect(positionOf(removePages(five, new Set([3])), 3)).toBeNull();
  });
});
