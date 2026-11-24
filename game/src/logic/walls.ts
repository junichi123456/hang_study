import type { ActionResult, Cell, Edge, GameEvent, GameState, PlayerId } from './types';
import { edgeIdx, edgeKey, edgesOfCell, hasWall } from './board';
import { advanceTurn } from './turn';

export function wallOptions(s: GameState, cell: Cell): Edge[] {
  return edgesOfCell(cell).filter((e) => !hasWall(s, e));
}

export function applyEdgeWall(s: GameState, e: Edge, owner: PlayerId): GameState {
  if (e.o === 'H') { const h = [...s.hWalls]; h[edgeIdx(e)] = owner; return { ...s, hWalls: h }; }
  const v = [...s.vWalls]; v[edgeIdx(e)] = owner; return { ...s, vWalls: v };
}

/** 移動確定後: 壁候補があれば wall フェーズへ、なければ手番進行 */
export function finishTurnAfterMove(s: GameState, pieceId: string, dest: Cell, events: GameEvent[]): ActionResult {
  if (wallOptions(s, dest).length > 0) {
    const next: GameState = { ...s, phase: 'wall', pendingWall: { pieceId, cell: { ...dest } } };
    return { ok: true, state: next, events: [...events, { type: 'phaseChanged', phase: 'wall' }] };
  }
  const ev = [...events, { type: 'wallSkipped', cell: { ...dest } } as GameEvent];
  const r = advanceTurn(s, ev, false);
  return { ok: true, state: r.state, events: r.events };
}

export function applyWall(s: GameState, edge: Edge): ActionResult {
  if (s.phase !== 'wall' || !s.pendingWall) return { ok: false, error: 'WRONG_PHASE' };
  const ok = wallOptions(s, s.pendingWall.cell).some((e) => edgeKey(e) === edgeKey(edge));
  if (!ok) return { ok: false, error: 'ILLEGAL_WALL' };
  const owner = s.currentPlayer;
  let next = applyEdgeWall(s, edge, owner);
  next = { ...next, pendingWall: null, phase: 'move', log: [...next.log, { t: 'wall', player: owner, edge: { ...edge } }] };
  const events: GameEvent[] = [{ type: 'wallPlaced', edge: { ...edge }, owner }];
  const r = advanceTurn(next, events, false);
  return { ok: true, state: r.state, events: r.events };
}
