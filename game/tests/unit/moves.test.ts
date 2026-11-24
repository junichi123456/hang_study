import { describe, expect, it } from 'vitest';
import { applyMove, edgeKey, legalMovesForPiece, representativeMoves } from '../../src/logic';
import type { Cell } from '../../src/logic';
import { fx } from '../helpers/boardFixture';
import { withPieces } from '../helpers/boards';

const set = (cs: Cell[]) => cs.map((c) => `${c.x},${c.y}`).sort();
const dests = (ms: { path: Cell[] }[]) => set(ms.map((m) => m.path[m.path.length - 1]!));
const S = (...a: [number, number][]) => a.map(([x, y]) => `${x},${y}`).sort();

describe('moves', () => {
  it('〇 空盤', () => {
    const s = fx(withPieces([['A', 4, 4]]));
    const ms = legalMovesForPiece(s, 'p0-c0');
    expect(ms).toHaveLength(12);
    expect(new Set(dests(ms))).toEqual(new Set(S([4, 3], [5, 4], [4, 5], [3, 4], [3, 3], [5, 3], [5, 5], [3, 5])));
    expect(ms.slice(0, 5).map((m) => m.dirs.join(''))).toEqual(['N', 'NE', 'NW', 'E', 'EN']);
  });
  it('〇 角', () => {
    const ms = legalMovesForPiece(fx(withPieces([['A', 0, 0]])), 'p0-c0');
    expect(ms.map((m) => m.dirs.join(''))).toEqual(['E', 'ES', 'S', 'SE']);
  });
  it('□ 空盤/角', () => {
    expect(new Set(dests(legalMovesForPiece(fx(withPieces([['A', 0, 0], ['a', 4, 4]])), 'p0-s0')))).toEqual(new Set(S([4, 3], [4, 2], [5, 4], [6, 4], [4, 5], [4, 6], [3, 4], [2, 4])));
    expect(new Set(dests(legalMovesForPiece(fx(withPieces([['a', 0, 0], ['B', 8, 8]])), 'p0-s0')))).toEqual(new Set(S([1, 0], [2, 0], [0, 1], [0, 2])));
  });
  it('□ 飛び越し不可', () => {
    const a = legalMovesForPiece(fx(withPieces([['a', 4, 4], ['B', 5, 4]])), 'p0-s0');
    expect(a.some((m) => m.dirs[0] === 'E')).toBe(false);
    const b = legalMovesForPiece(fx(withPieces([['a', 4, 4], ['B', 6, 4]])), 'p0-s0');
    expect(b.filter((m) => m.dirs[0] === 'E').map((m) => m.dirs.length)).toEqual([1]);
  });
  it('〇 駒でブロック', () => {
    const ms = legalMovesForPiece(fx(withPieces([['A', 4, 4], ['B', 4, 3]])), 'p0-c0');
    expect(ms.some((m) => m.dirs[0] === 'N')).toBe(false);
    const d = (x: number, y: number) => ms.find((m) => m.path[m.path.length - 1]!.x === x && m.path[m.path.length - 1]!.y === y)!;
    expect(d(3, 3).dirs).toEqual(['W', 'N']); expect(d(5, 3).dirs).toEqual(['E', 'N']);
  });
  it('壁と壁破り', () => {
    const s = fx(withPieces([['a', 4, 4], ['B', 8, 8]], ['H:4,3']));
    const ms = legalMovesForPiece(s, 'p0-s0').filter((m) => m.dirs[0] === 'N');
    expect(ms.map((m) => m.dirs.join(''))).toEqual(['N', 'NN']);
    expect(ms.every((m) => m.breakEdge && edgeKey(m.breakEdge) === 'H:4,3')).toBe(true);
    const used = { ...s, wallBreakUsed: [true, false] };
    expect(legalMovesForPiece(used, 'p0-s0').some((m) => m.dirs[0] === 'N')).toBe(false);
  });
  it('二重壁は破れない / 代表手', () => {
    const s = fx(withPieces([['A', 4, 4], ['B', 8, 8]], ['V:4,4', 'H:5,3']));
    const ms = legalMovesForPiece(s, 'p0-c0');
    expect(ms.some((m) => m.dirs.join('') === 'EN')).toBe(false);
    const nE = ms.find((m) => m.dirs.join('') === 'NE')!;
    expect(nE.breakEdge).toBeNull();
    expect(ms.find((m) => m.dirs.join('') === 'E')!.breakEdge).toEqual({ o: 'V', x: 4, y: 4 });
    const rep = representativeMoves(ms).find((m) => m.path[1]?.x === 5 && m.path[1]?.y === 3)!;
    expect(rep.dirs).toEqual(['N', 'E']);
  });
  it('applyMove 壁破り', () => {
    const s = fx(withPieces([['a', 4, 4], ['B', 8, 8]], ['H:4,3']));
    const m = legalMovesForPiece(s, 'p0-s0').find((x) => x.dirs.join('') === 'NN')!;
    const r = applyMove(s, m);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.pieces.find((p) => p.id === 'p0-s0')!.pos).toEqual({ x: 4, y: 2 });
    expect(r.state.hWalls[3 * 9 + 4]).toBe(-1);
    expect(r.state.wallBreakUsed[0]).toBe(true);
    expect(r.state.phase).toBe('wall');
    expect(r.state.pendingWall!.cell).toEqual({ x: 4, y: 2 });
    expect(r.events[0]).toMatchObject({ type: 'pieceMoved', brokenEdge: { o: 'H', x: 4, y: 3 } });
  });
  it('applyMove 不正', () => {
    const s = fx(withPieces([['a', 4, 4], ['B', 8, 8]]));
    const base = { pieceId: 'p0-s0', dirs: ['N' as const], path: [{ x: 4, y: 3 }], breakEdge: null };
    expect(applyMove(s, { ...base, pieceId: 'p1-c0' })).toEqual({ ok: false, error: 'NOT_YOUR_PIECE' });
    expect(applyMove(s, { ...base, dirs: ['N', 'E'] })).toEqual({ ok: false, error: 'ILLEGAL_MOVE' });
    expect(applyMove(s, { ...base, breakEdge: { o: 'H', x: 4, y: 3 } })).toEqual({ ok: false, error: 'ILLEGAL_MOVE' });
    expect(applyMove({ ...s, phase: 'wall' }, base)).toEqual({ ok: false, error: 'WRONG_PHASE' });
  });
  it('外周は壊せない', () => {
    const ms = legalMovesForPiece(fx(withPieces([['a', 8, 4], ['B', 0, 0]])), 'p0-s0');
    expect(ms.some((m) => m.dirs[0] === 'E')).toBe(false);
  });
});
