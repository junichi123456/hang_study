import './ui/styles.css';
import type { GameConfig, GameState, PlayerCount } from './logic';
import { Controller } from './app/controller';
import { showTitle } from './ui/screens';
import { installHooks } from './testHooks';

const app = document.getElementById('app') as HTMLElement;
let ctrl: Controller | null = null;
let closeTitle: (() => void) | null = null;
let lastConfig: GameConfig | null = null;

function toTitle(): void {
  ctrl?.dispose(); ctrl = null;
  closeTitle?.();
  closeTitle = showTitle(app, (count: PlayerCount, names: string[]) => startGame({ playerCount: count, playerNames: names }));
}

function startGame(config: GameConfig, initial?: GameState): void {
  closeTitle?.(); closeTitle = null;
  ctrl?.dispose();
  lastConfig = config;
  ctrl = new Controller(app, config, (restart) => {
    if (restart && lastConfig) startGame(lastConfig); else toTitle();
  }, initial);
}

const params = new URLSearchParams(location.search);
if (params.get('test') === '1' || import.meta.env.DEV) {
  installHooks(() => ctrl, (s) => startGame(s.config, s));
}
toTitle();

if ('serviceWorker' in navigator && import.meta.env.PROD && params.get('test') !== '1' && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}
