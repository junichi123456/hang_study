import { describe, expect, it } from 'vitest';
import { computeScores, rankPlayers } from '../../src/logic';
import type { PlayerScore } from '../../src/logic';
import { fx } from '../helpers/boardFixture';
import { withPieces } from '../helpers/boards';

const sc = (player: 0 | 1 | 2, territory: number, c: number, p: number): PlayerScore => ({ player, territory, bestRegionCells: c, bestRegionPieces: p });

describe('scoring', () => {
  it('territory 決着', () => {
    const r = rankPlayers([sc(0, 36, 36, 2), sc(1, 45, 45, 2)], 'separated');
    expect(r.winners).toEqual([1]); expect(r.decidedBy).toBe('territory');
  });
  it('efficiency 決着', () => {
    const r = rankPlayers([sc(0, 40, 30, 2), sc(1, 40, 40, 4)], 'separated');
    expect(r.winners).toEqual([0]); expect(r.decidedBy).toBe('efficiency');
  });
  it('引き分け', () => {
    const r = rankPlayers([sc(0, 40, 20, 2), sc(1, 40, 40, 4)], 'separated');
    expect(r.winners).toEqual([0, 1]); expect(r.decidedBy).toBe('draw');
    expect(r.ranking.map((x) => x.rank)).toEqual([1, 1]);
  });
  it('3人 競技順位', () => {
    const r = rankPlayers([sc(0, 40, 20, 2), sc(1, 40, 20, 2), sc(2, 1, 1, 1)], 'separated');
    expect(r.ranking.map((x) => x.rank)).toEqual([1, 1, 3]);
    const r2 = rankPlayers([sc(0, 30, 10, 2), sc(1, 20, 20, 2), sc(2, 30, 30, 2)], 'separated');
    expect(r2.ranking.map((x) => [x.player, x.rank])).toEqual([[2, 1], [0, 2], [1, 3]]);
    expect(r2.decidedBy).toBe('efficiency');
  });
  it('computeScores 複数領域', () => {
    // 左 x<=2 (27マス) に A,a / x=3..8 を V:5 でさらに分割: 中 x3..5 (27) に A,a? 駒数から 3領域で検証
    const s = fx(withPieces([['A', 0, 0], ['a', 1, 1], ['A', 4, 4], ['a', 5, 5], ['B', 8, 8]],
      [...Array.from({ length: 9 }, (_, y) => `V:2,${y}`), ...Array.from({ length: 9 }, (_, y) => `V:5,${y}`)]));
    const r = computeScores(s);
    expect(r[0]).toMatchObject({ territory: 54, bestRegionCells: 27, bestRegionPieces: 2 });
    expect(r[1]!.territory).toBe(27);
  });
  it('誰も領域を持たない', () => {
    const r = rankPlayers(computeScores(fx(withPieces([['A', 0, 0], ['B', 8, 8]]))), 'turnLimit');
    expect(r.decidedBy).toBe('draw'); expect(r.ranking.every((x) => x.score.territory === 0)).toBe(true);
  });
});
