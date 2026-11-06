import { describe, expect, it } from 'vitest';
import { displayToUser, userAngle, type PageBox } from './coordinates';

const letter = (rotation: number, x = 0, y = 0): PageBox => ({
  x,
  y,
  width: 612,
  height: 792,
  rotation,
});

describe('displayToUser', () => {
  it('flips y on an unrotated page', () => {
    expect(displayToUser({ x: 72, y: 100 }, letter(0))).toEqual({ x: 72, y: 692 });
  });

  it('honours a page box that does not start at zero', () => {
    expect(displayToUser({ x: 72, y: 100 }, letter(0, 10, 20))).toEqual({ x: 82, y: 712 });
  });

  it('handles each rotation', () => {
    expect(displayToUser({ x: 72, y: 100 }, letter(90))).toEqual({ x: 100, y: 72 });
    expect(displayToUser({ x: 72, y: 100 }, letter(180))).toEqual({ x: 540, y: 100 });
    expect(displayToUser({ x: 72, y: 100 }, letter(270))).toEqual({ x: 512, y: 720 });
  });
});

describe('pages that don’t start at zero', () => {
  it('honours the offset at every rotation', () => {
    const offset = (rotation: number) => letter(rotation, 10, 20);
    expect(displayToUser({ x: 72, y: 100 }, offset(90))).toEqual({ x: 110, y: 92 });
    expect(displayToUser({ x: 72, y: 100 }, offset(180))).toEqual({ x: 550, y: 120 });
    expect(displayToUser({ x: 72, y: 100 }, offset(270))).toEqual({ x: 522, y: 740 });
  });
});

describe('pages with a larger unit', () => {
  it('scales positions down to PDF units', () => {
    expect(displayToUser({ x: 72, y: 100 }, { ...letter(0), unit: 2 })).toEqual({ x: 36, y: 742 });
  });
});

describe('userAngle', () => {
  it('reverses direction, because display angles run clockwise', () => {
    expect(userAngle(30, 0)).toBe(-30);
  });

  it('adds the page rotation, so upright text stays upright on a rotated page', () => {
    expect(userAngle(0, 90)).toBe(90);
    expect(userAngle(0, 270)).toBe(270);
  });
});
