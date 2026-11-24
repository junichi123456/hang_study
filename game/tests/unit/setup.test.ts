import { describe, expect, it } from 'vitest';
import { createGame, legalPlacementCells, placeSquare } from '../../src/logic';
import type { GameState } from '../../src/logic';

const g2 = () => createGame({ playerCount: 2, playerNames: [] });
const g3 = () => createGame({ playerCount: 3, playerNames: [] });
const must = (r: ReturnType<typeof placeSquare>): GameState => { if (!r.ok) throw new Error(r.error); return r.state; };

describe('setup', () => {
  it('2人戦初期', () => {
    const s = g2();
    const pos = (id: string) => s.pieces.find((p) => p.id === id)!.pos;
    expect(s.pieces).toHaveLength(4);
    expect(pos('p0-c0')).toEqual({ x: 6, y: 2 }); expect(pos('p0-c1')).toEqual({ x: 2, y: 6 });
    expect(pos('p1-c0')).toEqual({ x: 2, y: 2 }); expect(pos('p1-c1')).toEqual({ x: 6, y: 6 });
    expect(s.placementQueue).toEqual([0, 1, 0, 1]);
    expect(s.phase).toBe('placement'); expect(s.currentPlayer).toBe(0);
    expect(s.config.playerNames).toEqual(['プレイヤー1', 'プレイヤー2']);
  });
  it('3人戦初期', () => {
    const s = g3();
    expect(s.pieces.map((p) => [p.owner, p.pos.x, p.pos.y])).toEqual([[0, 2, 6], [1, 6, 2], [2, 6, 6]]);
    expect(s.placementQueue).toEqual([0, 1, 2, 0, 1, 2]);
  });
  it('legalPlacementCells', () => {
    expect(legalPlacementCells(g2())).toHaveLength(77);
    expect(legalPlacementCells(g3())).toHaveLength(78);
  });
  it('エラー', () => {
    const s = g2();
    expect(placeSquare(s, { x: 6, y: 2 })).toEqual({ ok: false, error: 'CELL_OCCUPIED' });
    expect(placeSquare(s, { x: 9, y: 2 })).toEqual({ ok: false, error: 'OUT_OF_BOUNDS' });
  });
  it('4回配置で移動フェーズ', () => {
    let s = g2();
    [[0, 0], [8, 0], [0, 8], [8, 8]].forEach(([x, y]) => { s = must(placeSquare(s, { x: x!, y: y! })); });
    expect(s.phase).toBe('move'); expect(s.currentPlayer).toBe(0);
    expect(s.pieces.filter((p) => p.kind === 'square').map((p) => p.id)).toEqual(['p0-s0', 'p1-s0', 'p0-s1', 'p1-s1']);
    expect(placeSquare(s, { x: 4, y: 4 })).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });
  it('immutable', () => {
    const s = g2(); const before = structuredClone(s);
    placeSquare(s, { x: 0, y: 0 });
    expect(s).toEqual(before);
  });
});
