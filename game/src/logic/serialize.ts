import type { GameState } from './types';

export function serialize(s: GameState): string { return JSON.stringify(s); }

export function deserialize(json: string): GameState {
  const s = JSON.parse(json) as GameState;
  const n = s?.config?.playerCount;
  if ((n !== 2 && n !== 3) || !Array.isArray(s.pieces) || s.hWalls?.length !== 72 || s.vWalls?.length !== 72 ||
      !Array.isArray(s.wallBreakUsed) || s.wallBreakUsed.length !== n || !Array.isArray(s.log)) {
    throw new Error('invalid game state');
  }
  return s;
}
