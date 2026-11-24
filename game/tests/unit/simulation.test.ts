import { describe, expect, it } from 'vitest';
import { applyMove, applyWall, createGame, legalMoves, legalPlacementCells, placeSquare, wallOptions } from '../../src/logic';
import type { GameState, PlayerCount } from '../../src/logic';

function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; }

function play(n: PlayerCount, seed: number): GameState {
  const r = rng(seed);
  let s = createGame({ playerCount: n, playerNames: [] });
  const must = (x: ReturnType<typeof placeSquare>) => { if (!x.ok) throw new Error(x.error); return x.state; };
  while (s.phase === 'placement') { const c = legalPlacementCells(s); s = must(placeSquare(s, c[Math.floor(r() * c.length)]!)); }
  for (let i = 0; i < 1000 && s.phase !== 'finished'; i++) {
    if (s.phase === 'move') { const ms = legalMoves(s); s = must(applyMove(s, ms[Math.floor(r() * ms.length)]!) as never); }
    else { const o = wallOptions(s, s.pendingWall!.cell); s = must(applyWall(s, o[Math.floor(r() * o.length)]!) as never); }
  }
  return s;
}

describe('random games terminate', () => {
  for (const n of [2, 3] as const) {
    it(`${n}人戦 20局`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const s = play(n, seed);
        expect(s.phase).toBe('finished');
        expect(s.result!.ranking).toHaveLength(n);
      }
    });
  }
});
