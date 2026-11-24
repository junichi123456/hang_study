import { describe, expect, it } from 'vitest';
import { applyMove, applyWall, legalMovesForPiece, wallOptions } from '../../src/logic';
import { fx } from '../helpers/boardFixture';
import { withPieces } from '../helpers/boards';

describe('walls', () => {
  it('wallOptions', () => {
    const s = fx(withPieces([['A', 4, 4], ['B', 8, 8]]));
    expect(wallOptions(s, { x: 0, y: 0 })).toEqual([{ o: 'V', x: 0, y: 0 }, { o: 'H', x: 0, y: 0 }]);
    expect(wallOptions(s, { x: 4, y: 4 })).toEqual([{ o: 'H', x: 4, y: 3 }, { o: 'V', x: 4, y: 4 }, { o: 'H', x: 4, y: 4 }, { o: 'V', x: 3, y: 4 }]);
    const w = fx(withPieces([['A', 4, 4], ['B', 8, 8]], ['H:4,3']));
    expect(wallOptions(w, { x: 4, y: 4 })).toHaveLength(3);
  });
  it('applyWall', () => {
    const s = fx(withPieces([['A', 4, 4], ['B', 8, 8]]));
    const m = legalMovesForPiece(s, 'p0-c0')[0]!; // N
    const r1 = applyMove(s, m); if (!r1.ok) throw new Error();
    expect(applyWall(r1.state, { o: 'H', x: 0, y: 0 })).toEqual({ ok: false, error: 'ILLEGAL_WALL' });
    const r2 = applyWall(r1.state, { o: 'H', x: 4, y: 2 }); if (!r2.ok) throw new Error();
    expect(r2.state.hWalls[2 * 9 + 4]).toBe(0);
    expect(r2.state.pendingWall).toBeNull();
    expect(r2.state.currentPlayer).toBe(1);
    expect(r2.state.phase).toBe('move');
  });
  it('移動先に常に壁候補が残る(入ってきた辺は空いている)', () => {
    const s = fx(withPieces([['a', 4, 4], ['B', 8, 8]], ['V:4,3', 'V:3,3', 'H:4,2']));
    const m = legalMovesForPiece(s, 'p0-s0').find((x) => x.dirs.join('') === 'N')!;
    const r = applyMove(s, m); if (!r.ok) throw new Error();
    expect(r.state.phase).toBe('wall');
    expect(wallOptions(r.state, r.state.pendingWall!.cell)).toEqual([{ o: 'H', x: 4, y: 3 }]);
  });
});
