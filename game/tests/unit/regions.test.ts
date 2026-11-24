import { describe, expect, it } from 'vitest';
import { cellOwnerMap, computeRegions, computeScores, isSeparated, isSettled } from '../../src/logic';
import { fx } from '../helpers/boardFixture';
import { withPieces } from '../helpers/boards';

const vline = (x: number) => Array.from({ length: 9 }, (_, y) => `V:${x},${y}`);
const S1 = withPieces(
  [['B', 2, 2], ['A', 6, 2], ['b', 1, 1], ['a', 6, 4], ['A', 2, 6], ['B', 6, 6], ['b', 4, 7], ['a', 0, 8]],
  ['H:4,2', 'H:0,5', 'H:1,5', 'H:2,5', 'V:2,6', 'V:2,7', 'V:2,8'],
);

describe('regions', () => {
  it('空盤', () => {
    const r = computeRegions(fx(withPieces([['A', 0, 0], ['B', 8, 8]])));
    expect(r).toHaveLength(1); expect(r[0]!.cells).toHaveLength(81); expect(r[0]!.owners).toEqual([0, 1]);
  });
  it('縦壁で2分割', () => {
    const r = computeRegions(fx(withPieces([['A', 0, 0], ['B', 8, 8]], vline(3))));
    expect(r.map((x) => x.cells.length).sort((a, b) => a - b)).toEqual([36, 45]);
  });
  it('S1', () => {
    const s = fx(S1);
    const r = computeRegions(s);
    expect(r).toHaveLength(2);
    const small = r.find((x) => x.cells.length === 9)!;
    expect(small.owners).toEqual([0]);
    expect(r.find((x) => x.cells.length === 72)!.owners).toEqual([0, 1]);
    const sc = computeScores(s);
    expect(sc[0]).toMatchObject({ territory: 9, bestRegionCells: 9, bestRegionPieces: 2 });
    expect(sc[1]!.territory).toBe(0);
    expect(isSettled(s, 0)).toBe(false);
  });
  it('駒なし領域は中立', () => {
    const s = fx(withPieces([['A', 4, 4], ['B', 8, 8]], ['V:0,0', 'H:0,0']));
    const r = computeRegions(s);
    expect(r.find((x) => x.cells.length === 1)!.owners).toEqual([]);
    expect(computeScores(s).map((x) => x.territory)).toEqual([0, 0]);
    expect(cellOwnerMap(s)[0]).toBeNull();
  });
  it('isSeparated', () => {
    const w = vline(3);
    expect(isSeparated(fx(withPieces([['A', 0, 0], ['a', 1, 1], ['B', 8, 8], ['b', 5, 5]], w)))).toBe(true);
    expect(isSeparated(fx(withPieces([['A', 0, 0], ['B', 2, 2], ['b', 5, 5]], w)))).toBe(false);
  });
  it('3人戦', () => {
    const s = fx(withPieces([['A', 0, 0], ['B', 1, 1], ['C', 8, 8]], vline(3)), { playerCount: 3 });
    expect(computeScores(s).map((x) => x.territory)).toEqual([0, 0, 45]);
  });
});
