import { describe, expect, it } from 'vitest';
import { advanceTurn, applyMove, applyWall, deserialize, legalMovesForPiece, serialize } from '../../src/logic';
import { fx } from '../helpers/boardFixture';
import { withPieces } from '../helpers/boards';

const vline = (x: number, to = 8) => Array.from({ length: to + 1 }, (_, y) => `V:${x},${y}`);

describe('turn', () => {
  it('分断終了', () => {
    const near = fx(withPieces([['a', 1, 3], ['A', 2, 6], ['a', 1, 8], ['A', 3, 8], ['B', 6, 2], ['b', 7, 3], ['b', 5, 5], ['B', 6, 6]], vline(3, 7)),
      { phase: 'wall', currentPlayer: 0, pendingWall: { pieceId: 'p0-c1', cell: { x: 3, y: 8 } } });
    const r = applyWall(near, { o: 'V', x: 3, y: 8 });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.state.phase).toBe('finished');
    expect(r.state.result).toMatchObject({ reason: 'separated', winners: [1] });
    expect(r.state.result!.ranking.map((x) => x.score.territory)).toEqual([45, 36]);
    expect(r.events.at(-1)!.type).toBe('gameEnded');
  });
  it('手数上限', () => {
    const s = fx(withPieces([['A', 4, 4], ['B', 0, 0]]), { turnCount: 199 });
    const m = applyMove(s, legalMovesForPiece(s, 'p0-c0')[0]!); if (!m.ok) throw new Error();
    const r = applyWall(m.state, { o: 'H', x: 4, y: 2 }); if (!r.ok) throw new Error();
    expect(r.state.result?.reason).toBe('turnLimit');
  });
  it('通常手番', () => {
    const s = fx(withPieces([['A', 4, 4], ['B', 0, 0]]));
    const m = applyMove(s, legalMovesForPiece(s, 'p0-c0')[0]!); if (!m.ok) throw new Error();
    const r = applyWall(m.state, { o: 'H', x: 4, y: 2 }); if (!r.ok) throw new Error();
    expect(r.state.turnCount).toBe(1); expect(r.state.currentPlayer).toBe(1);
    expect(r.events.at(-1)).toEqual({ type: 'turnStarted', player: 1 });
    expect(r.state.log.map((l) => l.t)).toEqual(['move', 'wall']);
  });
  it('確定プレイヤーはスキップ(3人)', () => {
    // P0 は左下の閉領域に単独、P1/P2 は共有領域
    const walls = ['H:0,5', 'H:1,5', 'H:2,5', 'V:2,6', 'V:2,7', 'V:2,8'];
    const s = fx(withPieces([['A', 0, 8], ['B', 4, 4], ['C', 6, 6]], walls), { playerCount: 3, currentPlayer: 2 });
    const r = advanceTurn(s, []);
    expect(r.events).toContainEqual({ type: 'playerSkipped', player: 0 });
    expect(r.state.currentPlayer).toBe(1);
  });
  it('パス', () => {
    // P1 の〇は角で四方塞がり、壁破り使用済み
    const s = fx(withPieces([['A', 4, 4], ['B', 0, 0], ['a', 1, 0], ['a', 0, 1]], ['H:5,4']), { wallBreakUsed: [true, true] });
    const r = advanceTurn({ ...s, currentPlayer: 0 }, []);
    expect(r.events).toContainEqual({ type: 'turnPassed', player: 1 });
    expect(r.state.currentPlayer).toBe(0);
    expect(r.state.turnCount).toBe(2);
  });
  it('serialize 往復', () => {
    const s = fx(withPieces([['A', 4, 4], ['B', 0, 0]]));
    expect(deserialize(serialize(s))).toEqual(s);
    expect(() => deserialize('{"config":{"playerCount":2}}')).toThrow();
  });
});
