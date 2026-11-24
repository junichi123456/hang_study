import type { Cell, Edge, GameConfig, GameEvent, GameState, Move, PlayerId } from '../logic';
import {
  applyMove, applyWall, cellOwnerMap, computeScores, createGame, edgeKey, legalMovesForPiece,
  legalPlacementCells, movablePieceIds, placeSquare, representativeMoves, wallOptions,
} from '../logic';
import { GameView, emptyOverlay } from '../render/gameView';
import type { Overlay } from '../render/gameView';
import { Hud } from '../ui/hud';
import { confirmQuit, h, showResult, showRules } from '../ui/screens';
import { TURN_BANNER_MS } from '../render/animMath';

interface Selection { pieceId: string | null; target: Cell | null; edge: Edge | null; move: Move | null; placeCell: Cell | null; }
const sameCell = (a: Cell | null, b: Cell | null) => !!a && !!b && a.x === b.x && a.y === b.y;

export class Controller {
  state!: GameState;
  private view: GameView;
  private hud: Hud;
  private root: HTMLElement;
  private sel: Selection = { pieceId: null, target: null, edge: null, move: null, placeCell: null };
  private moves: Move[] = [];
  private reps: Move[] = [];
  private resultCleanup: (() => void) | null = null;
  private down: { x: number; y: number } | null = null;
  private onExit: (restart: boolean) => void;
  private config: GameConfig;
  private disposed = false;

  constructor(parent: HTMLElement, config: GameConfig, onExit: (restart: boolean) => void, initial?: GameState) {
    this.config = config; this.onExit = onExit;
    this.root = h('div', { class: 'game', 'data-testid': 'game-screen' });
    const viewEl = h('div', { class: 'view' });
    this.state = initial ?? createGame(config);
    this.config = this.state.config;
    this.hud = new Hud(this.state.config.playerCount, {
      confirm: () => void this.confirm(), cancel: () => this.cancel(),
      menu: () => confirmQuit(this.root, () => this.onExit(false)),
      rules: () => showRules(this.root),
    });
    this.root.append(this.hud.el, viewEl);
    parent.append(this.root);
    this.view = new GameView(viewEl);
    const cv = this.view.canvas;
    cv.addEventListener('pointerdown', (e) => { this.down = { x: e.clientX, y: e.clientY }; });
    cv.addEventListener('pointerup', (e) => {
      const d = this.down; this.down = null;
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 10) void this.tap(e.clientX, e.clientY);
    });
    this.view.sync(this.state);
    this.afterChange(true);
    if (this.state.phase === 'move') this.banner(this.state.currentPlayer);
  }

  get gameView(): GameView { return this.view; }
  get selection(): Selection { return this.sel; }
  isBusy(): boolean { return this.view.isBusy(); }
  getConfig(): GameConfig { return this.config; }

  dispose(): void {
    this.disposed = true;
    this.resultCleanup?.();
    this.view.dispose();
    this.root.remove();
  }

  private banner(p: PlayerId): void {
    const b = h('div', { class: 'banner', 'data-testid': 'turn-banner' }, `${this.state.config.playerNames[p]}の番です`);
    this.root.querySelector('.view')?.append(b);
    setTimeout(() => b.remove(), TURN_BANNER_MS);
  }

  private resetSel(): void { this.sel = { pieceId: null, target: null, edge: null, move: null, placeCell: null }; }

  /** 状態に基づく選択候補・ハイライト・HUD の更新 */
  private afterChange(resetSelection: boolean): void {
    const s = this.state;
    if (resetSelection) this.resetSel();
    this.moves = []; this.reps = [];
    if (s.phase === 'move' && this.sel.pieceId) {
      this.moves = legalMovesForPiece(s, this.sel.pieceId);
      this.reps = representativeMoves(this.moves);
    }
    const o: Overlay = emptyOverlay();
    o.currentPlayer = s.currentPlayer;
    let phaseText = '';
    let confirmEnabled = false, confirmLabel = '確定', showCancel = false;
    if (s.phase === 'placement') {
      o.cells = legalPlacementCells(s);
      const left = s.placementQueue.length;
      phaseText = `□を置くマスを選んでください(残り${left})`;
      if (this.sel.placeCell) { o.ghostSquare = { cell: this.sel.placeCell, owner: s.currentPlayer }; o.targetCell = null; confirmEnabled = true; }
    } else if (s.phase === 'move') {
      o.movableIds = movablePieceIds(s);
      o.selectedPieceId = this.sel.pieceId;
      showCancel = true;
      if (!this.sel.pieceId) phaseText = '動かす駒を選んでください';
      else {
        phaseText = '移動先を選んでください';
        for (const r of this.reps) (r.breakEdge ? o.breakCells : o.cells).push(r.path[r.path.length - 1] as Cell);
        if (this.sel.move) {
          const piece = s.pieces.find((p) => p.id === this.sel.pieceId)!;
          o.targetCell = this.sel.target;
          o.path = [piece.pos, ...this.sel.move.path];
          o.breakEdge = this.sel.move.breakEdge;
          confirmEnabled = true;
          if (this.sel.move.breakEdge) { confirmLabel = '壁破りして移動'; phaseText = '壁破りを使用します(ゲーム中1回)'; }
        }
      }
    } else if (s.phase === 'wall' && s.pendingWall) {
      o.ghostEdges = wallOptions(s, s.pendingWall.cell);
      o.selectedEdge = this.sel.edge;
      phaseText = '壁を建てる辺を選んでください';
      confirmEnabled = !!this.sel.edge;
    } else if (s.phase === 'finished') {
      phaseText = '対局が終わりました';
    }
    this.view.setOverlay(o);
    this.view.setTerritory(cellOwnerMap(s), s.phase === 'finished');
    this.lastHighlights = { cells: o.cells, breakCells: o.breakCells, edges: o.ghostEdges };
    const scores = computeScores(s).map((x) => x.territory);
    this.hudInfo = { phaseText, confirmLabel, confirmEnabled, showCancel, busy: false, scores };
    this.hud.update(s, this.hudInfo);
  }
  lastHighlights: { cells: Cell[]; breakCells: Cell[]; edges: Edge[] } = { cells: [], breakCells: [], edges: [] };
  private hudInfo!: Parameters<Hud['update']>[1];

  private setBusyUi(b: boolean): void { this.hud.update(this.state, { ...this.hudInfo, busy: b }); }

  async tap(clientX: number, clientY: number): Promise<void> {
    if (this.view.isBusy() || this.state.phase === 'finished' || this.disposed) return;
    const hit = this.view.pick(clientX, clientY);
    if (!hit) return;
    const s = this.state;
    if (s.phase === 'placement') {
      if (!hit.cell) return;
      if (!legalPlacementCells(s).some((c) => sameCell(c, hit.cell))) return;
      if (sameCell(this.sel.placeCell, hit.cell)) return this.confirm();
      this.sel.placeCell = hit.cell; this.afterChange(false);
    } else if (s.phase === 'move') {
      const c = hit.cell;
      if (!c) { this.sel.pieceId = null; this.sel.target = null; this.sel.move = null; this.afterChange(false); return; }
      const rep = this.reps.find((r) => sameCell(r.path[r.path.length - 1] as Cell, c));
      if (this.sel.pieceId && rep) {
        if (sameCell(this.sel.target, c)) return this.confirm();
        this.sel.target = c; this.sel.move = rep; this.afterChange(false); return;
      }
      const own = s.pieces.find((p) => p.owner === s.currentPlayer && sameCell(p.pos, c));
      if (own && movablePieceIds(s).includes(own.id)) {
        this.sel = { pieceId: own.id, target: null, edge: null, move: null, placeCell: null };
      } else { this.sel.pieceId = null; this.sel.target = null; this.sel.move = null; }
      this.afterChange(false);
    } else if (s.phase === 'wall' && s.pendingWall) {
      const opts = wallOptions(s, s.pendingWall.cell);
      let best: Edge | null = null, bd = 0.9;
      for (const e of opts) {
        const mx = e.o === 'H' ? e.x - 4 : e.x - 4 + 0.5, mz = e.o === 'H' ? e.y - 4 + 0.5 : e.y - 4;
        const d = Math.hypot(hit.wx - mx, hit.wz - mz);
        if (d <= bd) { bd = d; best = e; }
      }
      if (!best) return;
      if (this.sel.edge && edgeKey(this.sel.edge) === edgeKey(best)) return this.confirm();
      this.sel.edge = best; this.afterChange(false);
    }
  }

  cancel(): void {
    if (this.view.isBusy() || this.state.phase !== 'move') return;
    this.resetSel(); this.afterChange(false);
  }

  async confirm(): Promise<void> {
    if (this.view.isBusy() || this.disposed) return;
    const s = this.state;
    let r;
    if (s.phase === 'placement' && this.sel.placeCell) r = placeSquare(s, this.sel.placeCell);
    else if (s.phase === 'move' && this.sel.move) r = applyMove(s, this.sel.move);
    else if (s.phase === 'wall' && this.sel.edge) r = applyWall(s, this.sel.edge);
    else return;
    if (!r.ok) return;
    await this.commit(r.state, r.events);
  }

  /** 新状態へ遷移(アニメ再生 → 同期) */
  async commit(next: GameState, events: GameEvent[]): Promise<void> {
    const prev = this.state;
    this.state = next;
    this.resetSel();
    // アニメ中はハイライト類を消す
    const o = emptyOverlay(); this.view.setOverlay(o);
    this.setBusyUi(true);
    await this.view.play(events, next);
    if (this.disposed) return;
    this.view.sync(next);
    this.afterChange(true);
    this.setBusyUi(false);
    void prev;
    const started = events.find((e) => e.type === 'turnStarted');
    if (started && started.type === 'turnStarted' && next.phase === 'move') this.banner(started.player);
    if (next.phase === 'finished' && next.result) {
      this.resultCleanup?.();
      this.resultCleanup = showResult(this.root, next, next.result, {
        restart: () => this.onExit(true), title: () => this.onExit(false), toggle: () => undefined,
      });
    }
  }

  /** テスト用: 任意の状態を読み込み */
  load(state: GameState): void {
    this.resultCleanup?.(); this.resultCleanup = null;
    this.state = state;
    this.view.sync(state);
    this.afterChange(true);
  }
}
