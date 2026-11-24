import type { GameState } from '../logic';
import { PLAYER_COLORS } from '../logic';
import { MAX_TURNS } from '../logic';
import { h } from './screens';

export interface HudHandlers { confirm: () => void; cancel: () => void; menu: () => void; rules: () => void; }
export interface HudInfo { phaseText: string; confirmLabel: string; confirmEnabled: boolean; showCancel: boolean; busy: boolean; scores: number[]; }

export class Hud {
  readonly el: HTMLElement;
  private cur: HTMLElement; private phase: HTMLElement; private turn: HTMLElement;
  private scoreEls: HTMLElement[] = []; private breakEls: HTMLElement[] = [];
  private confirmBtn: HTMLButtonElement; private cancelBtn: HTMLButtonElement;

  constructor(private n: number, hd: HudHandlers) {
    this.el = h('div', { class: 'hud', 'data-testid': 'hud' });
    this.cur = h('div', { class: 'cur', 'data-testid': 'hud-current-player' });
    this.phase = h('div', { class: 'phase', 'data-testid': 'hud-phase' });
    this.turn = h('div', { class: 'turn', 'data-testid': 'hud-turn' });
    const scores = h('div', { class: 'scores' });
    for (let p = 0; p < n; p++) {
      const row = h('div', { class: 'score-row', 'data-testid': `hud-score-row-${p}` });
      const chip = h('span', { class: 'chip' }); chip.style.background = PLAYER_COLORS[p] as string;
      const name = h('span', { class: 'sname' });
      const sc = h('span', { class: 'sc', 'data-testid': `hud-score-${p}` });
      const br = h('span', { class: 'brk', 'data-testid': `hud-break-${p}` });
      row.append(chip, name, sc, br); scores.append(row);
      this.scoreEls.push(sc); this.breakEls.push(br);
    }
    const btns = h('div', { class: 'hud-btns' });
    this.confirmBtn = h('button', { class: 'btn primary', 'data-testid': 'confirm-button' }, '確定');
    this.cancelBtn = h('button', { class: 'btn', 'data-testid': 'cancel-button' }, 'キャンセル');
    const menu = h('button', { class: 'btn', 'data-testid': 'menu-button' }, 'メニュー');
    const rules = h('button', { class: 'btn', 'data-testid': 'hud-rules' }, 'ルール');
    this.confirmBtn.onclick = hd.confirm; this.cancelBtn.onclick = hd.cancel; menu.onclick = hd.menu; rules.onclick = hd.rules;
    btns.append(this.confirmBtn, this.cancelBtn, menu, rules);
    this.el.append(this.cur, this.phase, scores, this.turn, btns);
  }

  update(s: GameState, info: HudInfo): void {
    const p = s.currentPlayer;
    this.cur.textContent = '';
    const chip = h('span', { class: 'chip' }); chip.style.background = PLAYER_COLORS[p] as string;
    this.cur.append(chip, h('span', {}, s.phase === 'finished' ? '対局終了' : `${s.config.playerNames[p]}の番`));
    this.phase.textContent = info.phaseText;
    this.turn.textContent = `手数 ${s.turnCount} / ${MAX_TURNS}`;
    for (let i = 0; i < this.n; i++) {
      const row = this.el.querySelector(`[data-testid="hud-score-row-${i}"]`) as HTMLElement;
      row.classList.toggle('current', i === p && s.phase !== 'finished');
      (row.querySelector('.sname') as HTMLElement).textContent = s.config.playerNames[i] as string;
      (this.scoreEls[i] as HTMLElement).textContent = `確定 ${info.scores[i] ?? 0}`;
      const used = s.wallBreakUsed[i];
      const br = this.breakEls[i] as HTMLElement;
      br.textContent = `壁破り ${used ? 0 : 1}`; br.classList.toggle('used', !!used);
    }
    this.confirmBtn.textContent = info.confirmLabel;
    this.confirmBtn.disabled = !info.confirmEnabled || info.busy;
    this.cancelBtn.style.display = info.showCancel ? '' : 'none';
    this.cancelBtn.disabled = info.busy;
  }
}
