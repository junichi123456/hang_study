import * as THREE from 'three';
import type { Cell, Edge, GameEvent, GameState, Piece, PlayerId } from '../logic';
import { PLAYER_COLORS, NEUTRAL_WALL, edgeKey } from '../logic';
import { updateCamera } from './camera';
import { buildPirateScenery } from './scenery';
import type { Scenery } from './scenery';
import {
  MOVE_DURATION_MS, PLACE_DROP_MS, WALL_BREAK_MS, WALL_RISE_MS,
  easeOutBack, easeOutQuad, samplePath,
} from './animMath';

export interface Overlay {
  /** 通常の移動先 / 配置可能セル */
  cells: Cell[];
  /** 壁破りが必要な移動先 */
  breakCells: Cell[];
  /** 選択中の移動先 / 配置セル */
  targetCell: Cell | null;
  /** 経路プレビュー(開始セル含む) */
  path: Cell[] | null;
  breakEdge: Edge | null;
  /** 壁候補 */
  ghostEdges: Edge[];
  selectedEdge: Edge | null;
  ghostSquare: { cell: Cell; owner: PlayerId } | null;
  movableIds: string[];
  selectedPieceId: string | null;
  currentPlayer: PlayerId;
}

export const emptyOverlay = (): Overlay => ({
  cells: [], breakCells: [], targetCell: null, path: null, breakEdge: null, ghostEdges: [],
  selectedEdge: null, ghostSquare: null, movableIds: [], selectedPieceId: null, currentPlayer: 0,
});

export type AnimKind = 'move' | 'wallRise' | 'wallBreak' | 'drop';
export interface AnimRecord { kind: AnimKind; startedAt: number; endedAt: number | null; }

const wx = (c: { x: number }) => c.x - 4;
const wz = (c: { y: number }) => c.y - 4;

function wallColor(value: number): THREE.Color {
  if (value === NEUTRAL_WALL || value < 0 || value > 2) return new THREE.Color('#9E9E9E');
  return new THREE.Color(PLAYER_COLORS[value] as string).lerp(new THREE.Color('#000000'), 0.3);
}
function edgeCenter(e: Edge): THREE.Vector3 {
  return e.o === 'H' ? new THREE.Vector3(e.x - 4, 0, e.y - 4 + 0.5) : new THREE.Vector3(e.x - 4 + 0.5, 0, e.y - 4);
}
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface PieceNode { group: THREE.Group; body: THREE.Group; ring: THREE.Mesh; mat: THREE.MeshStandardMaterial; lift: number; piece: Piece; }
interface WallNode { group: THREE.Group; mesh: THREE.Mesh; edge: Edge; }

export class GameView {
  readonly canvas: HTMLCanvasElement;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.5, 100);
  private pieces = new Map<string, PieceNode>();
  private walls = new Map<string, WallNode>();
  private overlayGroup = new THREE.Group();
  private territoryGroup = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private busy = 0;
  private records: AnimRecord[] = [];
  private overlay: Overlay = emptyOverlay();
  private selectedId: string | null = null;
  private pulsing: THREE.Material[] = [];
  private rafId = 0;
  private resizeObs: ResizeObserver;
  private territoryAlpha = 0.18;
  private territoryTarget = 0.18;
  private territoryMats: THREE.MeshBasicMaterial[] = [];
  private scenery: Scenery | null = null;
  webglOk = true;

  constructor(private container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('data-testid', 'game-canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;';
    container.appendChild(this.canvas);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    } catch {
      this.webglOk = false;
      const msg = document.createElement('div');
      msg.className = 'webgl-error';
      msg.textContent = 'この端末は3D表示に対応していません';
      container.appendChild(msg);
    }
    this.resizeObs = new ResizeObserver(() => this.resize());
    if (!this.webglOk) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.buildStatic();
    this.scenery = buildPirateScenery(this.scene);
    this.scene.add(this.territoryGroup, this.overlayGroup);
    this.resizeObs.observe(container);
    this.resize();
    document.addEventListener('visibilitychange', this.onVis);
    this.loop();
  }

  private onVis = () => {
    if (document.hidden) cancelAnimationFrame(this.rafId);
    else { cancelAnimationFrame(this.rafId); this.loop(); }
  };

  dispose(): void {
    cancelAnimationFrame(this.rafId);
    document.removeEventListener('visibilitychange', this.onVis);
    this.resizeObs.disconnect();
    this.scenery?.dispose();
    this.renderer?.dispose();
    this.canvas.remove();
    this.container.querySelector('.webgl-error')?.remove();
  }

  // ---------- static scene ----------
  private buildStatic(): void {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xffe8d0, 0x3a2a1a, 0.55));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(5, 12, 7);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    Object.assign(dir.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
    s.add(dir);

    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.4, 10.2), new THREE.MeshStandardMaterial({ color: '#5D4037' }));
    pedestal.position.y = -0.4; pedestal.receiveShadow = true; s.add(pedestal);
    const groove = new THREE.Mesh(new THREE.BoxGeometry(9, 0.2, 9), new THREE.MeshStandardMaterial({ color: '#8D6E4F' }));
    groove.position.y = -0.11; groove.receiveShadow = true; s.add(groove);

    const geo = new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);
    const mats = [new THREE.MeshStandardMaterial({ color: '#D9B98A' }), new THREE.MeshStandardMaterial({ color: '#CFAE7E' })];
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const m = new THREE.Mesh(geo, mats[(x + y) % 2]);
      m.position.set(x - 4, 0, y - 4); m.receiveShadow = true; s.add(m);
    }
    const frameMat = new THREE.MeshStandardMaterial({ color: '#6D4C41' });
    const mk = (w: number, d: number, x: number, z: number) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), frameMat);
      b.position.set(x, 0.15, z); b.castShadow = true; b.receiveShadow = true; s.add(b);
    };
    mk(9.6, 0.3, 0, -4.65); mk(9.6, 0.3, 0, 4.65); mk(0.3, 9, -4.65, 0); mk(0.3, 9, 4.65, 0);
  }

  resize(): void {
    if (!this.webglOk) return;
    const w = Math.max(1, this.container.clientWidth), h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    updateCamera(this.camera, w, h);
  }

  private loop = () => {
    this.rafId = requestAnimationFrame(this.loop);
    const t = performance.now() / 1000;
    const pulse = 0.35 + 0.15 * Math.sin(t * Math.PI * 2 * 1.2);
    for (const n of this.pieces.values()) {
      const target = n.piece.id === this.selectedId ? 0.15 : 0;
      n.lift += (target - n.lift) * 0.25;
      n.body.position.y = n.lift;
      n.mat.emissive.set(n.piece.id === this.selectedId ? PLAYER_COLORS[n.piece.owner] as string : '#000000');
      n.mat.emissiveIntensity = n.piece.id === this.selectedId ? pulse : 0;
      if (n.ring.visible) (n.ring.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.25 * Math.sin(t * 4);
    }
    this.scenery?.update(t);
    this.territoryAlpha += (this.territoryTarget - this.territoryAlpha) * 0.12;
    for (const m of this.territoryMats) m.opacity = this.territoryAlpha;
    this.renderer.render(this.scene, this.camera);
  };

  // ---------- state sync ----------
  private makePiece(p: Piece): PieceNode {
    const color = PLAYER_COLORS[p.owner] as string;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
    const group = new THREE.Group();
    const body = new THREE.Group();
    if (p.kind === 'circle') {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 32), mat);
      cyl.position.y = 0.11; cyl.castShadow = true; cyl.receiveShadow = true;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.03, 12, 32), new THREE.MeshStandardMaterial({ color: '#ffffff' }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.225;
      body.add(cyl, ring);
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.6), mat);
      box.position.y = 0.2; box.castShadow = true; box.receiveShadow = true;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.62, 0.4, 0.62)), new THREE.LineBasicMaterial({ color: '#ffffff' }));
      edges.position.y = 0.2;
      body.add(box, edges);
    }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.46, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }));
    ring.position.y = 0.02; ring.visible = false;
    group.add(body, ring);
    this.scene.add(group);
    return { group, body, ring, mat, lift: 0, piece: p };
  }

  private makeWall(e: Edge, value: number): WallNode {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      e.o === 'H' ? new THREE.BoxGeometry(1.04, 0.5, 0.12) : new THREE.BoxGeometry(0.12, 0.5, 1.04),
      new THREE.MeshStandardMaterial({ color: wallColor(value), roughness: 0.6 }));
    mesh.position.y = 0.25; mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    const c = edgeCenter(e);
    group.position.set(c.x, 0, c.z);
    this.scene.add(group);
    return { group, mesh, edge: e };
  }

  private disposeNode(g: THREE.Object3D): void {
    this.scene.remove(g);
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.();
    });
  }

  /** 静的状態へ即座に同期(アニメなし) */
  sync(s: GameState): void {
    const ids = new Set(s.pieces.map((p) => p.id));
    for (const [id, n] of this.pieces) if (!ids.has(id)) { this.disposeNode(n.group); this.pieces.delete(id); }
    for (const p of s.pieces) {
      let n = this.pieces.get(p.id);
      if (!n) { n = this.makePiece(p); this.pieces.set(p.id, n); }
      n.piece = p;
      n.group.position.set(wx(p.pos), 0, wz(p.pos));
      n.group.visible = true;
    }
    const keys = new Set<string>();
    const add = (e: Edge, v: number) => {
      if (v < 0) return;
      const k = edgeKey(e); keys.add(k);
      if (!this.walls.has(k)) this.walls.set(k, this.makeWall(e, v));
    };
    for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) add({ o: 'H', x, y }, s.hWalls[y * 9 + x] as number);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 8; x++) add({ o: 'V', x, y }, s.vWalls[y * 8 + x] as number);
    for (const [k, n] of this.walls) if (!keys.has(k)) { this.disposeNode(n.group); this.walls.delete(k); }
  }

  setTerritory(owner: (PlayerId | null)[], strong: boolean): void {
    for (const c of [...this.territoryGroup.children]) { this.territoryGroup.remove(c); (c as THREE.Mesh).geometry.dispose(); }
    for (const m of this.territoryMats) m.dispose();
    this.territoryMats = PLAYER_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: this.territoryAlpha, depthWrite: false }));
    const geo = new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);
    owner.forEach((o, i) => {
      if (o === null) return;
      const m = new THREE.Mesh(geo, this.territoryMats[o]);
      m.position.set((i % 9) - 4, 0.005, Math.floor(i / 9) - 4);
      this.territoryGroup.add(m);
    });
    this.territoryTarget = strong ? 0.4 : 0.18;
  }

  // ---------- overlay ----------
  setOverlay(o: Overlay): void {
    this.overlay = o;
    this.selectedId = o.selectedPieceId;
    for (const n of this.pieces.values()) n.ring.visible = o.movableIds.includes(n.piece.id);
    for (const c of [...this.overlayGroup.children]) { this.overlayGroup.remove(c); this.disposeNode(c); }
    const color = PLAYER_COLORS[o.currentPlayer] as string;
    const tile = (c: Cell, col: string, op: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false }));
      m.position.set(wx(c), 0.012, wz(c)); this.overlayGroup.add(m);
    };
    for (const c of o.cells) tile(c, o.movableIds.length || o.ghostEdges.length ? '#7CFC00' : '#FFFFFF', o.movableIds.length ? 0.45 : 0.22);
    for (const c of o.breakCells) tile(c, '#FF9800', 0.55);
    if (o.targetCell) tile(o.targetCell, '#FFFFFF', 0.5);
    if (o.path && o.path.length > 1) {
      for (let i = 0; i < o.path.length - 1; i++) {
        const a = o.path[i] as Cell, b = o.path[i + 1] as Cell;
        const horiz = a.y === b.y;
        const m = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 1 : 0.08, 0.02, horiz ? 0.08 : 1),
          new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }));
        m.position.set((wx(a) + wx(b)) / 2, 0.03, (wz(a) + wz(b)) / 2);
        this.overlayGroup.add(m);
      }
    }
    if (o.breakEdge) {
      const c = edgeCenter(o.breakEdge);
      const m = new THREE.Mesh(
        o.breakEdge.o === 'H' ? new THREE.BoxGeometry(1.08, 0.54, 0.16) : new THREE.BoxGeometry(0.16, 0.54, 1.08),
        new THREE.MeshBasicMaterial({ color: '#ff1744', transparent: true, opacity: 0.55 }));
      m.position.set(c.x, 0.25, c.z); this.overlayGroup.add(m);
    }
    for (const e of o.ghostEdges) {
      const sel = o.selectedEdge && edgeKey(o.selectedEdge) === edgeKey(e);
      const c = edgeCenter(e);
      const m = new THREE.Mesh(
        e.o === 'H' ? new THREE.BoxGeometry(1.04, 0.5, 0.12) : new THREE.BoxGeometry(0.12, 0.5, 1.04),
        new THREE.MeshStandardMaterial({ color, transparent: true, opacity: sel ? 0.8 : 0.35, depthWrite: false }));
      m.position.set(c.x, 0.25, c.z); this.overlayGroup.add(m);
    }
    if (o.ghostSquare) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.6),
        new THREE.MeshStandardMaterial({ color: PLAYER_COLORS[o.ghostSquare.owner] as string, transparent: true, opacity: 0.55 }));
      m.position.set(wx(o.ghostSquare.cell), 0.2, wz(o.ghostSquare.cell)); this.overlayGroup.add(m);
    }
  }
  getOverlay(): Overlay { return this.overlay; }

  // ---------- animations ----------
  isBusy(): boolean { return this.busy > 0; }
  lastAnimations(): AnimRecord[] { return this.records.slice(-20).map((r) => ({ ...r })); }

  private tween(kind: AnimKind, ms: number, update: (t: number) => void): Promise<void> {
    const rec: AnimRecord = { kind, startedAt: performance.now(), endedAt: null };
    this.records.push(rec);
    if (this.records.length > 100) this.records.shift();
    this.busy++;
    return new Promise((resolve) => {
      const step = () => {
        const t = Math.min(1, (performance.now() - rec.startedAt) / ms);
        update(t);
        if (t < 1) requestAnimationFrame(step);
        else { rec.endedAt = performance.now(); this.busy--; resolve(); }
      };
      step();
    });
  }

  /** イベント列を順にアニメ再生。終了後は呼び出し側が sync(新状態) する */
  async play(events: GameEvent[], next: GameState): Promise<void> {
    for (const ev of events) {
      if (ev.type === 'squarePlaced') {
        const p = next.pieces.find((x) => x.id === ev.pieceId);
        if (!p) continue;
        const n = this.makePiece(p);
        this.pieces.set(p.id, n);
        n.group.position.set(wx(p.pos), 3, wz(p.pos));
        await this.tween('drop', PLACE_DROP_MS, (t) => { n.group.position.y = 3 * (1 - easeOutQuad(t)); });
        n.group.position.y = 0;
      } else if (ev.type === 'pieceMoved') {
        await this.playMove(ev);
      } else if (ev.type === 'wallPlaced') {
        const value = ev.owner;
        const k = edgeKey(ev.edge);
        if (this.walls.has(k)) continue;
        const w = this.makeWall(ev.edge, value);
        this.walls.set(k, w);
        w.group.scale.y = 0.001;
        await this.tween('wallRise', WALL_RISE_MS, (t) => { w.group.scale.y = Math.max(0.001, easeOutBack(t)); });
        w.group.scale.y = 1;
      }
    }
    while (this.busy > 0) await wait(10);
  }

  private async playMove(ev: Extract<GameEvent, { type: 'pieceMoved' }>): Promise<void> {
    const n = this.pieces.get(ev.pieceId);
    if (!n) return;
    const pts = [ev.from, ...ev.path];
    let breakAt = -1; // 経路距離
    if (ev.brokenEdge) {
      const bk = edgeKey(ev.brokenEdge);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i] as Cell, b = pts[i + 1] as Cell;
        const e: Edge = a.x === b.x
          ? { o: 'H', x: a.x, y: Math.min(a.y, b.y) } : { o: 'V', x: Math.min(a.x, b.x), y: a.y };
        if (edgeKey(e) === bk) breakAt = i + 0.5 - 0.45;
      }
    }
    let breakStarted = false;
    const extra: Promise<void>[] = [];
    const L = pts.length - 1;
    await this.tween('move', MOVE_DURATION_MS, (t) => {
      const p = samplePath(pts, t);
      n.group.position.set(p.x - 4, p.hop, p.y - 4);
      if (!breakStarted && breakAt >= 0) {
        const s = easeS(t) * L;
        if (s >= breakAt) { breakStarted = true; extra.push(this.playBreak(ev.brokenEdge as Edge)); }
      }
    });
    const last = ev.path[ev.path.length - 1] as Cell;
    n.group.position.set(wx(last), 0, wz(last));
    if (ev.brokenEdge && !breakStarted) extra.push(this.playBreak(ev.brokenEdge));
    await Promise.all(extra);
  }

  private async playBreak(e: Edge): Promise<void> {
    const k = edgeKey(e);
    const w = this.walls.get(k);
    if (!w) return;
    const mat = w.mesh.material as THREE.MeshStandardMaterial;
    const base = mat.color.clone();
    const c = edgeCenter(e);
    const bits: { m: THREE.Mesh; v: THREE.Vector3 }[] = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: base, transparent: true }));
      m.position.set(c.x, 0.3, c.z);
      this.scene.add(m);
      bits.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 1.6, 1.5 + Math.random(), (Math.random() - 0.5) * 1.6) });
    }
    await this.tween('wallBreak', WALL_BREAK_MS, (t) => {
      mat.color.copy(base).lerp(new THREE.Color('#ff1744'), Math.min(1, t * 3));
      w.group.scale.y = Math.max(0.001, 1 - t);
      const sec = t * (WALL_BREAK_MS / 1000);
      for (const b of bits) {
        b.m.position.set(c.x + b.v.x * sec, 0.3 + b.v.y * sec - 4.9 * sec * sec, c.z + b.v.z * sec);
        (b.m.material as THREE.MeshStandardMaterial).opacity = 1 - t;
      }
    });
    for (const b of bits) this.disposeNode(b.m);
    this.disposeNode(w.group);
    this.walls.delete(k);
  }

  // ---------- picking / projection ----------
  private ndc(clientX: number, clientY: number): THREE.Vector2 {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -(((clientY - r.top) / r.height) * 2 - 1));
  }
  /** 盤面平面との交点(ワールド XZ)。盤外のセルは null */
  pick(clientX: number, clientY: number): { cell: Cell | null; wx: number; wz: number } | null {
    if (!this.webglOk) return null;
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.plane, hit)) return null;
    const x = Math.floor(hit.x + 4.5), y = Math.floor(hit.z + 4.5);
    const cell = x >= 0 && x < 9 && y >= 0 && y < 9 ? { x, y } : null;
    return { cell, wx: hit.x, wz: hit.z };
  }
  /** 世界座標(セル座標系で小数可)→ページ座標 */
  project(wxv: number, wyv: number, wzv: number): { x: number; y: number } {
    this.camera.updateMatrixWorld(true);
    const v = new THREE.Vector3(wxv, wyv, wzv).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }
  cellToScreen(x: number, y: number): { x: number; y: number } { return this.project(x - 4, 0, y - 4); }
  edgeToScreen(e: Edge): { x: number; y: number } { const c = edgeCenter(e); return this.project(c.x, 0, c.z); }
  boardCorners(): { x: number; y: number }[] {
    return [[-4.5, -4.5], [4.5, -4.5], [4.5, 4.5], [-4.5, 4.5]].map(([a, b]) => this.project(a as number, 0, b as number));
  }
}

function easeS(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
