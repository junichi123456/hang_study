import type { EndReason, GameEvent, GameState, PlayerId } from './types';
import { MAX_TURNS } from './constants';
import { isSeparated, isSettled } from './regions';
import { computeScores, rankPlayers } from './scoring';
import { legalMoves } from './moves';

function finish(s: GameState, events: GameEvent[], reason: EndReason): { state: GameState; events: GameEvent[] } {
  const result = rankPlayers(computeScores(s), reason);
  return {
    state: { ...s, phase: 'finished', pendingWall: null, result },
    events: [...events, { type: 'phaseChanged', phase: 'finished' }, { type: 'gameEnded', result }],
  };
}

/** 手番終了処理(4.9)。initial=true は移動フェーズ開始時(手数を進めない) */
export function advanceTurn(s: GameState, events: GameEvent[], initial = false): { state: GameState; events: GameEvent[] } {
  const n = s.config.playerCount;
  let st: GameState = { ...s };
  const ev = [...events];
  if (!initial) {
    st = { ...st, turnCount: st.turnCount + 1, consecutivePasses: 0 };
    if (isSeparated(st)) return finish(st, ev, 'separated');
    if (st.turnCount >= MAX_TURNS) return finish(st, ev, 'turnLimit');
  } else if (isSeparated(st)) return finish(st, ev, 'separated');

  let cur = initial ? st.currentPlayer : (((st.currentPlayer + 1) % n) as PlayerId);
  for (let i = 0; i < n; i++) {
    const asCur: GameState = { ...st, phase: 'move', currentPlayer: cur };
    if (isSettled(asCur, cur)) {
      ev.push({ type: 'playerSkipped', player: cur });
      st = { ...st, log: [...st.log, { t: 'skip', player: cur }] };
    } else if (legalMoves(asCur, cur).length === 0) {
      ev.push({ type: 'turnPassed', player: cur });
      st = { ...st, turnCount: st.turnCount + 1, consecutivePasses: st.consecutivePasses + 1, log: [...st.log, { t: 'pass', player: cur }] };
      let unsettled = 0;
      for (let p = 0; p < n; p++) if (!isSettled(st, p as PlayerId)) unsettled++;
      if (st.consecutivePasses >= unsettled) return finish(st, ev, 'allPassed');
      if (st.turnCount >= MAX_TURNS) return finish(st, ev, 'turnLimit');
    } else {
      ev.push({ type: 'turnStarted', player: cur });
      return { state: { ...st, phase: 'move', currentPlayer: cur, pendingWall: null }, events: ev };
    }
    cur = ((cur + 1) % n) as PlayerId;
  }
  return finish(st, ev, 'allPassed');
}
