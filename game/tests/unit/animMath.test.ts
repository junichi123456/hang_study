import { describe, expect, it } from 'vitest';
import { HOP_HEIGHT, MOVE_DURATION_MS, easeInOutCubic, samplePath } from '../../src/render/animMath';

describe('animMath', () => {
  it('duration', () => { expect(MOVE_DURATION_MS).toBeGreaterThanOrEqual(700); expect(MOVE_DURATION_MS).toBeLessThanOrEqual(900); });
  it('ease', () => {
    expect(easeInOutCubic(0)).toBe(0); expect(easeInOutCubic(1)).toBe(1); expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    for (let i = 0; i < 100; i++) expect(easeInOutCubic((i + 1) / 100)).toBeGreaterThanOrEqual(easeInOutCubic(i / 100));
  });
  it('samplePath 1歩', () => {
    const p = samplePath([{ x: 4, y: 4 }, { x: 5, y: 4 }], 0.5);
    expect(p.x).toBeCloseTo(4.5); expect(p.y).toBeCloseTo(4); expect(p.hop).toBeCloseTo(HOP_HEIGHT);
  });
  it('samplePath 2歩', () => {
    const pts = [{ x: 4, y: 4 }, { x: 5, y: 4 }, { x: 5, y: 3 }];
    const m = samplePath(pts, 0.5);
    expect(m.x).toBeCloseTo(5); expect(m.y).toBeCloseTo(4); expect(m.hop).toBeCloseTo(0, 5);
    expect(samplePath(pts, 1)).toMatchObject({ x: 5, y: 3 }); expect(samplePath(pts, 0)).toMatchObject({ x: 4, y: 4 });
    expect(samplePath(pts, 2)).toMatchObject({ x: 5, y: 3 }); expect(samplePath(pts, -1)).toMatchObject({ x: 4, y: 4 });
  });
});
