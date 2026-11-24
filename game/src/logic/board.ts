import type { Cell, Dir, Edge, GameState, Piece } from './types';
import { NO_WALL } from './types';
import { BOARD_SIZE } from './constants';

export { BOARD_SIZE };
export const DIRS: readonly Dir[] = ['N', 'E', 'S', 'W'];
const DELTA: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

export function inBounds(c: Cell): boolean {
  return c.x >= 0 && c.x < BOARD_SIZE && c.y >= 0 && c.y < BOARD_SIZE;
}
export function cellIdx(c: Cell): number { return c.y * BOARD_SIZE + c.x; }
export function idxCell(i: number): Cell { return { x: i % BOARD_SIZE, y: Math.floor(i / BOARD_SIZE) }; }
export function neighbor(c: Cell, d: Dir): Cell | null {
  const [dx, dy] = DELTA[d];
  const n = { x: c.x + dx, y: c.y + dy };
  return inBounds(n) ? n : null;
}
export function opposite(d: Dir): Dir { return ({ N: 'S', S: 'N', E: 'W', W: 'E' } as const)[d]; }
export function perpendicular(d: Dir): Dir[] {
  return d === 'N' || d === 'S' ? ['E', 'W'] : ['N', 'S'];
}
export function edgeBetween(a: Cell, b: Cell): Edge {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx === 0 && dy === 1) return { o: 'H', x: a.x, y: a.y };
  if (dx === 0 && dy === -1) return { o: 'H', x: a.x, y: a.y - 1 };
  if (dx === 1 && dy === 0) return { o: 'V', x: a.x, y: a.y };
  if (dx === -1 && dy === 0) return { o: 'V', x: a.x - 1, y: a.y };
  throw new Error('cells are not adjacent');
}
export function edgeKey(e: Edge): string { return `${e.o}:${e.x},${e.y}`; }
export function edgeIdx(e: Edge): number { return e.o === 'H' ? e.y * 9 + e.x : e.y * 8 + e.x; }
export function edgeInBounds(e: Edge): boolean {
  return e.o === 'H' ? e.x >= 0 && e.x <= 8 && e.y >= 0 && e.y <= 7 : e.x >= 0 && e.x <= 7 && e.y >= 0 && e.y <= 8;
}
export function edgesOfCell(c: Cell): Edge[] {
  const out: Edge[] = [];
  for (const d of DIRS) {
    const n = neighbor(c, d);
    if (n) out.push(edgeBetween(c, n));
  }
  return out;
}
export function hasWall(s: GameState, e: Edge): boolean {
  return (e.o === 'H' ? s.hWalls[edgeIdx(e)] : s.vWalls[edgeIdx(e)]) !== NO_WALL;
}
export function pieceAt(s: GameState, c: Cell): Piece | undefined {
  return s.pieces.find((p) => p.pos.x === c.x && p.pos.y === c.y);
}
export function sameCell(a: Cell, b: Cell): boolean { return a.x === b.x && a.y === b.y; }
