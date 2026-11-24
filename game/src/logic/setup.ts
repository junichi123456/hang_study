import type { ActionResult, Cell, GameConfig, GameEvent, GameState, Piece, PlayerId } from './types';
import { NO_WALL } from './types';
import { CIRCLE_START, SQUARES_PER_PLAYER } from './constants';
import { BOARD_SIZE, idxCell, inBounds, pieceAt } from './board';
import { advanceTurn } from './turn';

export function createGame(config: GameConfig): GameState {
  const n = config.playerCount;
  const names = Array.from({ length: n }, (_, i) => config.playerNames[i]?.trim() || `プレイヤー${i + 1}`);
  const pieces: Piece[] = [];
  for (let p = 0; p < n; p++) {
    (CIRCLE_START[n][p] ?? []).forEach((pos, i) =>
      pieces.push({ id: `p${p}-c${i}`, owner: p as PlayerId, kind: 'circle', pos: { ...pos } }));
  }
  const queue: PlayerId[] = [];
  for (let r = 0; r < SQUARES_PER_PLAYER; r++) for (let p = 0; p < n; p++) queue.push(p as PlayerId);
  return {
    config: { playerCount: n, playerNames: names },
    phase: 'placement', currentPlayer: 0, pieces,
    hWalls: new Array(72).fill(NO_WALL), vWalls: new Array(72).fill(NO_WALL),
    wallBreakUsed: new Array(n).fill(false), placementQueue: queue,
    pendingWall: null, turnCount: 0, consecutivePasses: 0, log: [], result: null,
  };
}

export function legalPlacementCells(s: GameState): Cell[] {
  if (s.phase !== 'placement') return [];
  const out: Cell[] = [];
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
    const c = idxCell(i);
    if (!pieceAt(s, c)) out.push(c);
  }
  return out;
}

export function placeSquare(s: GameState, cell: Cell): ActionResult {
  if (s.phase !== 'placement') return { ok: false, error: 'WRONG_PHASE' };
  if (!inBounds(cell)) return { ok: false, error: 'OUT_OF_BOUNDS' };
  if (pieceAt(s, cell)) return { ok: false, error: 'CELL_OCCUPIED' };
  const player = s.placementQueue[0] as PlayerId;
  const count = s.pieces.filter((p) => p.owner === player && p.kind === 'square').length;
  const piece: Piece = { id: `p${player}-s${count}`, owner: player, kind: 'square', pos: { x: cell.x, y: cell.y } };
  const events: GameEvent[] = [{ type: 'squarePlaced', pieceId: piece.id, cell: { ...cell } }];
  const queue = s.placementQueue.slice(1);
  let next: GameState = {
    ...s, pieces: [...s.pieces, piece], placementQueue: queue,
    currentPlayer: (queue[0] ?? 0) as PlayerId,
    log: [...s.log, { t: 'place', player, pieceId: piece.id, cell: { ...cell } }],
  };
  if (queue.length === 0) {
    next = { ...next, phase: 'move', currentPlayer: 0 };
    events.push({ type: 'phaseChanged', phase: 'move' });
    const r = advanceTurn(next, events, true);
    return { ok: true, state: r.state, events: r.events };
  }
  return { ok: true, state: next, events };
}
