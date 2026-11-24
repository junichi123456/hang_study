import type { Cell, GameState, PlayerId, Region } from './types';
import { BOARD_SIZE, DIRS, cellIdx, edgeBetween, hasWall, idxCell, neighbor } from './board';

export function computeRegions(s: GameState): Region[] {
  const n = s.config.playerCount;
  const visited = new Array<boolean>(BOARD_SIZE * BOARD_SIZE).fill(false);
  const regions: Region[] = [];
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
    if (visited[i]) continue;
    const stack = [idxCell(i)];
    visited[i] = true;
    const idxs: number[] = [];
    while (stack.length) {
      const c = stack.pop() as Cell;
      idxs.push(cellIdx(c));
      for (const d of DIRS) {
        const nb = neighbor(c, d);
        if (!nb || visited[cellIdx(nb)] || hasWall(s, edgeBetween(c, nb))) continue;
        visited[cellIdx(nb)] = true;
        stack.push(nb);
      }
    }
    idxs.sort((a, b) => a - b);
    const set = new Set(idxs);
    const piecesByPlayer = new Array<number>(n).fill(0);
    for (const p of s.pieces) if (set.has(cellIdx(p.pos))) piecesByPlayer[p.owner] = (piecesByPlayer[p.owner] ?? 0) + 1;
    const owners: PlayerId[] = [];
    piecesByPlayer.forEach((c, p) => { if (c > 0) owners.push(p as PlayerId); });
    regions.push({ id: regions.length, cells: idxs.map(idxCell), owners, piecesByPlayer });
  }
  return regions;
}

export function isSeparated(s: GameState): boolean {
  return computeRegions(s).every((r) => r.owners.length <= 1);
}

export function isSettled(s: GameState, p: PlayerId): boolean {
  const regions = computeRegions(s);
  const mine = s.pieces.filter((x) => x.owner === p);
  if (mine.length === 0) return true;
  return mine.every((pc) => {
    const r = regions.find((rg) => rg.cells.some((c) => c.x === pc.pos.x && c.y === pc.pos.y));
    return !!r && r.owners.length === 1 && r.owners[0] === p;
  });
}

export function cellOwnerMap(s: GameState): (PlayerId | null)[] {
  const map: (PlayerId | null)[] = new Array(BOARD_SIZE * BOARD_SIZE).fill(null);
  for (const r of computeRegions(s)) {
    if (r.owners.length === 1) for (const c of r.cells) map[cellIdx(c)] = r.owners[0] as PlayerId;
  }
  return map;
}
