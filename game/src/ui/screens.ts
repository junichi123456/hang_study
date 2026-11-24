import type { GameResult, GameState, PlayerCount } from '../logic';
import { PLAYER_COLORS } from '../logic';
import { loadSettings, saveSettings } from '../app/settings';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}

export function showRules(parent: HTMLElement): void {
  const modal = h('div', { class: 'modal', 'data-testid': 'rules-modal' });
  const box = h('div', { class: 'modal-box' });
  box.append(h('h2', {}, 'ルール'));
  const ul = h('ul');
  [
    '9×9の盤を、2人または3人で交代しながら遊びます(1台を回して使います)。',
    '各プレイヤーは〇の駒(固定位置スタート)と□の駒(最初に好きなマスへ配置)を持ちます。親(プレイヤー1)から順に□を2個ずつ置きます。',
    '手番では駒を1つ動かし、移動先マスのまわりに壁を1枚建てます。',
    '〇:1マス進み、もう一度90度曲がって1マス進めます(直進2マス・戻りは不可)。',
    '□:まっすぐ最大2マス進めます(曲がれません)。',
    '駒や壁は飛び越せません。駒のいるマスにも入れません。',
    '『壁破り』:1ゲームに1度だけ、進行方向の壁を1枚取り除いて進めます。',
    '壁で区切られた領域に自分の駒だけがいると、その領域のマスが自分の支配マスです。',
    '全員の駒が壁で分断されたら終了。支配マスが多い人の勝ち。',
    '同数のときは、1コマあたりの支配マスが多い領域を作った人の勝ちです。',
    '自分の駒がすべて自分だけの領域に入ったら、手番はスキップされます。',
  ].forEach((t) => ul.append(h('li', {}, t)));
  box.append(ul, h('p', { class: 'rule-fig' }, '〇: ・ ↗ のようにL字まで    □: ←→↑↓ 2マスまで'));
  const close = h('button', { 'data-testid': 'rules-close', class: 'btn' }, '閉じる');
  close.onclick = () => modal.remove();
  box.append(close); modal.append(box); parent.append(modal);
}

export function showTitle(parent: HTMLElement, onStart: (count: PlayerCount, names: string[]) => void): () => void {
  const s = loadSettings();
  const root = h('div', { class: 'screen title', 'data-testid': 'title-screen' });
  root.append(h('h1', {}, 'カベガコイ'), h('p', { class: 'sub' }, '壁で囲って陣地を取り合う 3D 対戦ボードゲーム'));
  const toggle = h('div', { class: 'toggle' });
  const names = h('div', { class: 'names' });
  let count: PlayerCount = s.playerCount;
  const inputs: HTMLInputElement[] = [];
  for (let i = 0; i < 3; i++) {
    const inp = h('input', { type: 'text', maxlength: '12', placeholder: `プレイヤー${i + 1}`, 'data-testid': `name-input-${i}` });
    inp.value = s.names[i] ?? '';
    const row = h('label', { class: 'name-row' });
    const chip = h('span', { class: 'chip' }); chip.style.background = PLAYER_COLORS[i] as string;
    row.append(chip, inp); names.append(row); inputs.push(inp);
  }
  const btns: Record<number, HTMLButtonElement> = {};
  const refresh = () => {
    for (const k of [2, 3]) (btns[k] as HTMLButtonElement).classList.toggle('active', k === count);
    (names.children[2] as HTMLElement).style.display = count === 3 ? '' : 'none';
  };
  for (const k of [2, 3] as const) {
    const b = h('button', { class: 'btn toggle-btn', 'data-testid': `player-count-${k}` }, `${k}人`);
    b.onclick = () => { count = k; refresh(); };
    btns[k] = b; toggle.append(b);
  }
  const start = h('button', { class: 'btn primary', 'data-testid': 'start-button' }, 'ゲーム開始');
  start.onclick = () => {
    const nm = inputs.map((i) => i.value.trim().slice(0, 12));
    saveSettings({ playerCount: count, names: nm });
    onStart(count, nm.slice(0, count));
  };
  const rules = h('button', { class: 'btn', 'data-testid': 'rules-button' }, 'ルール');
  rules.onclick = () => showRules(root);
  root.append(toggle, names, start, rules);
  parent.append(root); refresh();
  return () => root.remove();
}

export function showResult(parent: HTMLElement, state: GameState, result: GameResult, h2: { restart: () => void; title: () => void; toggle: (hidden: boolean) => void }): () => void {
  const name = (p: number) => state.config.playerNames[p] as string;
  const wrap = h('div', { class: 'modal', 'data-testid': 'result-screen' });
  const box = h('div', { class: 'modal-box' });
  const title = result.winners.length === 1 ? `${name(result.winners[0] as number)}の勝利!` : `引き分け(${result.winners.map(name).join('・')})`;
  box.append(h('h2', { 'data-testid': 'result-winner' }, title));
  if (result.decidedBy === 'efficiency') box.append(h('p', { class: 'note' }, '支配マス同数のため、1コマあたり支配マス数で決着'));
  if (result.reason === 'turnLimit') box.append(h('p', { class: 'note' }, '手数上限に達したため終了'));
  if (result.reason === 'allPassed') box.append(h('p', { class: 'note' }, '全員が動けなくなったため終了'));
  const table = h('table', { class: 'rank' });
  table.append(Object.assign(h('tr'), { innerHTML: '<th>順位</th><th>名前</th><th>支配マス</th><th>1コマあたり</th>' }));
  for (const r of result.ranking) {
    const tr = h('tr', { 'data-testid': `result-row-${r.player}` });
    const eff = r.score.bestRegionCells === 0 ? '-' : `${(r.score.bestRegionCells / r.score.bestRegionPieces).toFixed(1)} (${r.score.bestRegionCells}/${r.score.bestRegionPieces})`;
    for (const t of [`${r.rank}位`, name(r.player), String(r.score.territory), eff]) tr.append(h('td', {}, t));
    (tr.children[1] as HTMLElement).style.color = PLAYER_COLORS[r.player] as string;
    table.append(tr);
  }
  box.append(table);
  const row = h('div', { class: 'btn-row' });
  const again = h('button', { class: 'btn primary', 'data-testid': 'restart-button' }, 'もう一度(同じ設定)');
  again.onclick = h2.restart;
  const toTitle = h('button', { class: 'btn', 'data-testid': 'to-title-button' }, 'タイトルへ');
  toTitle.onclick = h2.title;
  const view = h('button', { class: 'btn', 'data-testid': 'result-toggle' }, '盤面を見る');
  const show = h('button', { class: 'btn show-result', 'data-testid': 'result-show' }, '結果を表示');
  show.style.display = 'none';
  view.onclick = () => { wrap.style.display = 'none'; show.style.display = ''; h2.toggle(true); };
  show.onclick = () => { wrap.style.display = ''; show.style.display = 'none'; h2.toggle(false); };
  row.append(again, toTitle, view);
  box.append(row); wrap.append(box); parent.append(wrap, show);
  return () => { wrap.remove(); show.remove(); };
}

export function confirmQuit(parent: HTMLElement, onYes: () => void): void {
  const modal = h('div', { class: 'modal', 'data-testid': 'confirm-quit' });
  const box = h('div', { class: 'modal-box small' });
  box.append(h('p', {}, 'タイトルへ戻りますか?(対局は失われます)'));
  const yes = h('button', { class: 'btn primary', 'data-testid': 'quit-yes' }, '戻る');
  const no = h('button', { class: 'btn', 'data-testid': 'quit-no' }, '続ける');
  yes.onclick = () => { modal.remove(); onYes(); };
  no.onclick = () => modal.remove();
  box.append(yes, no); modal.append(box); parent.append(modal);
}
