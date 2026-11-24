import type { GameState, PlayerCount, PlayerId, Piece, WallValue } from '../../src/logic/types';
import { NEUTRAL_WALL, NO_WALL } from '../../src/logic/types';

export function fx(ascii: string, overrides: Partial<GameState> & { playerCount?: PlayerCount } = {}): GameState {
  const lines = ascii.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length !== 19 || lines.some((l) => l.length !== 19)) {
    throw new Error(`fixture must be 19x19 (got ${lines.length} lines: ${lines.map((l) => l.length).join(',')})`);
  }
  const hWalls: WallValue[] = new Array(72).fill(NO_WALL);
  const vWalls: WallValue[] = new Array(72).fill(NO_WALL);
  const found: { owner: PlayerId; kind: 'circle' | 'square'; x: number; y: number }[] = [];
  for (let y = 0; y < 9; y++) {
    const row = lines[2 * y + 1] as string;
    for (let x = 0; x < 9; x++) {
      const ch = row[2 * x + 1] as string;
      const up = ch.toUpperCase();
      if ('ABC'.includes(up) && ch !== '.') found.push({ owner: ('ABC'.indexOf(up)) as PlayerId, kind: ch === up ? 'circle' : 'square', x, y });
      if (x < 8 && row[2 * x + 2] === '|') vWalls[y * 8 + x] = NEUTRAL_WALL;
    }
    if (y < 8) {
      const hr = lines[2 * y + 2] as string;
      for (let x = 0; x < 9; x++) if (hr[2 * x + 1] === '-') hWalls[y * 9 + x] = NEUTRAL_WALL;
    }
  }
  const maxP = found.reduce((m, f) => Math.max(m, f.owner), 1);
  const playerCount = (overrides.playerCount ?? (maxP + 1)) as PlayerCount;
  const counters: Record<string, number> = {};
  const pieces: Piece[] = [];
  const sorted = [...found].sort((a, b) => a.owner - b.owner || (a.kind === b.kind ? 0 : a.kind === 'circle' ? -1 : 1) || a.y * 9 + a.x - (b.y * 9 + b.x));
  for (const f of sorted) {
    const key = `${f.owner}${f.kind}`;
    const n = counters[key] ?? 0; counters[key] = n + 1;
    pieces.push({ id: `p${f.owner}-${f.kind === 'circle' ? 'c' : 's'}${n}`, owner: f.owner, kind: f.kind, pos: { x: f.x, y: f.y } });
  }
  const { playerCount: _pc, ...rest } = overrides;
  void _pc;
  return {
    config: { playerCount, playerNames: Array.from({ length: playerCount }, (_, i) => `プレイヤー${i + 1}`) },
    phase: 'move', currentPlayer: 0, pieces, hWalls, vWalls,
    wallBreakUsed: new Array(playerCount).fill(false), placementQueue: [], pendingWall: null,
    turnCount: 0, consecutivePasses: 0, log: [], result: null, ...rest,
  };
}

export function toAscii(s: GameState): string {
  const rows: string[][] = [];
  for (let i = 0; i < 19; i++) rows.push(new Array(19).fill(' '));
  for (let i = 0; i < 19; i += 2) for (let j = 0; j < 19; j++) rows[i]![j] = j % 2 === 0 ? '+' : (i === 0 || i === 18 ? '-' : ' ');
  for (let y = 0; y < 9; y++) {
    const r = rows[2 * y + 1]!;
    r[0] = '|'; r[18] = '|';
    for (let x = 0; x < 9; x++) r[2 * x + 1] = '.';
    for (let x = 0; x < 8; x++) if (s.vWalls[y * 8 + x] !== NO_WALL) r[2 * x + 2] = '|'; else r[2 * x + 2] = ' ';
    if (y < 8) for (let x = 0; x < 9; x++) rows[2 * y + 2]![2 * x + 1] = s.hWalls[y * 9 + x] !== NO_WALL ? '-' : ' ';
  }
  for (const p of s.pieces) {
    const ch = 'ABC'[p.owner] as string;
    rows[2 * p.pos.y + 1]![2 * p.pos.x + 1] = p.kind === 'circle' ? ch : ch.toLowerCase();
  }
  return rows.map((r) => r.join('')).join('\n');
}
