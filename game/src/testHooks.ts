import type { Cell, Edge, GameState } from './logic';
import { deserialize } from './logic';
import type { Controller } from './app/controller';

export function installHooks(get: () => Controller | null, loadState: (s: GameState) => void): void {
  const c = () => { const x = get(); if (!x) throw new Error('no game'); return x; };
  (window as unknown as { __HANG__: unknown }).__HANG__ = {
    getState: () => structuredClone(c().state),
    loadState: (j: string | GameState) => loadState(typeof j === 'string' ? deserialize(j) : j),
    cellToScreen: (x: number, y: number) => c().gameView.cellToScreen(x, y),
    edgeToScreen: (e: Edge) => c().gameView.edgeToScreen(e),
    getHighlights: () => structuredClone(c().lastHighlights),
    getSelection: () => ({ pieceId: c().selection.pieceId, target: c().selection.target as Cell | null, edge: c().selection.edge }),
    isBusy: () => c().isBusy(),
    lastAnimations: () => c().gameView.lastAnimations(),
    getBoardCorners: () => c().gameView.boardCorners(),
  };
}
