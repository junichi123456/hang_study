import type { ActionResult, Cell, Dir, Edge, GameEvent, GameState, Move, Piece, PlayerId } from './types';
import { DIRS, edgeBetween, edgeKey, hasWall, neighbor, perpendicular, pieceAt } from './board';
import { finishTurnAfterMove } from './walls';
import { NO_WALL } from './types';
import { edgeIdx } from './board';

interface Step { to: Cell; brk: Edge | null }

function tryStep(s: GameState, piece: Piece, from: Cell, d: Dir, brkSoFar: Edge | null, canBreak: boolean): Step | null {
  const to = neighbor(from, d);
  if (!to) return null;
  const occ = pieceAt(s, to);
  if (occ && occ.id !== piece.id) return null;
  const e = edgeBetween(from, to);
  if (hasWall(s, e)) {
    if (canBreak && brkSoFar === null) return { to, brk: e };
    return null;
  }
  return { to, brk: brkSoFar };
}

export function legalMovesForPiece(s: GameState, pieceId: string): Move[] {
  const piece = s.pieces.find((p) => p.id === pieceId);
  if (!piece || s.phase !== 'move' || piece.owner !== s.currentPlayer) return [];
  const canBreak = !s.wallBreakUsed[piece.owner];
  const out: Move[] = [];
  const start = piece.pos;
  if (piece.kind === 'circle') {
    for (const d1 of DIRS) {
      const r1 = tryStep(s, piece, start, d1, null, canBreak);
      if (!r1) continue;
      out.push({ pieceId, dirs: [d1], path: [r1.to], breakEdge: r1.brk });
      for (const d2 of perpendicular(d1)) {
        const r2 = tryStep(s, piece, r1.to, d2, r1.brk, canBreak);
        if (!r2) continue;
        out.push({ pieceId, dirs: [d1, d2], path: [r1.to, r2.to], breakEdge: r2.brk });
      }
    }
  } else {
    for (const d of DIRS) {
      const r1 = tryStep(s, piece, start, d, null, canBreak);
      if (!r1) continue;
      out.push({ pieceId, dirs: [d], path: [r1.to], breakEdge: r1.brk });
      const r2 = tryStep(s, piece, r1.to, d, r1.brk, canBreak);
      if (!r2) continue;
      out.push({ pieceId, dirs: [d, d], path: [r1.to, r2.to], breakEdge: r2.brk });
    }
  }
  return out;
}

export function legalMoves(s: GameState, player?: PlayerId): Move[] {
  const p = player ?? s.currentPlayer;
  const out: Move[] = [];
  for (const piece of s.pieces) {
    if (piece.owner !== p) continue;
    const saved = s;
    out.push(...legalMovesForPiece(p === saved.currentPlayer ? s : { ...s, currentPlayer: p }, piece.id));
  }
  return out;
}

export function movablePieceIds(s: GameState): string[] {
  return s.pieces.filter((p) => p.owner === s.currentPlayer && legalMovesForPiece(s, p.id).length > 0).map((p) => p.id);
}

export function representativeMoves(moves: Move[]): Move[] {
  const order: string[] = [];
  const best = new Map<string, Move>();
  for (const m of moves) {
    const t = m.path[m.path.length - 1] as Cell;
    const k = `${t.x},${t.y}`;
    const cur = best.get(k);
    if (!cur) { best.set(k, m); order.push(k); }
    else if (cur.breakEdge !== null && m.breakEdge === null) best.set(k, m);
  }
  return order.map((k) => best.get(k) as Move);
}

export function applyMove(s: GameState, move: Move): ActionResult {
  if (s.phase !== 'move') return { ok: false, error: 'WRONG_PHASE' };
  const piece = s.pieces.find((p) => p.id === move.pieceId);
  if (!piece) return { ok: false, error: 'UNKNOWN_PIECE' };
  if (piece.owner !== s.currentPlayer) return { ok: false, error: 'NOT_YOUR_PIECE' };
  const found = legalMovesForPiece(s, piece.id).find((m) =>
    m.dirs.length === move.dirs.length && m.dirs.every((d, i) => d === move.dirs[i]) &&
    (m.breakEdge === null ? move.breakEdge === null : move.breakEdge !== null && edgeKey(m.breakEdge) === edgeKey(move.breakEdge)));
  if (!found) return { ok: false, error: 'ILLEGAL_MOVE' };
  const dest = found.path[found.path.length - 1] as Cell;
  const from = { ...piece.pos };
  const pieces = s.pieces.map((p) => (p.id === piece.id ? { ...p, pos: { ...dest } } : p));
  let hWalls = s.hWalls, vWalls = s.vWalls;
  let wallBreakUsed = s.wallBreakUsed;
  if (found.breakEdge) {
    const e = found.breakEdge;
    if (e.o === 'H') { hWalls = [...hWalls]; hWalls[edgeIdx(e)] = NO_WALL; }
    else { vWalls = [...vWalls]; vWalls[edgeIdx(e)] = NO_WALL; }
    wallBreakUsed = s.wallBreakUsed.map((u, i) => (i === piece.owner ? true : u));
  }
  const events: GameEvent[] = [{ type: 'pieceMoved', pieceId: piece.id, from, path: found.path.map((c) => ({ ...c })), brokenEdge: found.breakEdge }];
  const next: GameState = {
    ...s, pieces, hWalls, vWalls, wallBreakUsed,
    log: [...s.log, { t: 'move', player: piece.owner, move: found }],
  };
  return finishTurnAfterMove(next, piece.id, dest, events);
}
