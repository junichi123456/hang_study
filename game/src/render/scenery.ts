import * as THREE from 'three';

/** 海賊船の船室、テーブルの上の雑多な宝や小物(すべて手続き生成。外部アセットなし) */
const TABLE_Y = -0.6;

function rng(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
}

function woodTexture(base: string, dark: string, plankW: number, seed: number, repeat: [number, number]): THREE.CanvasTexture {
  const size = 512, r = rng(seed);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let x = 0; x < size; x += plankW) {
    g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.15})`; g.fillRect(x, 0, plankW, size);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(${dark},${0.08 + r() * 0.2})`; g.lineWidth = 1 + r() * 1.5;
      const gx = x + 3 + r() * (plankW - 6);
      g.beginPath(); g.moveTo(gx, 0);
      g.bezierCurveTo(gx + (r() - 0.5) * 10, size * 0.3, gx + (r() - 0.5) * 10, size * 0.7, gx + (r() - 0.5) * 6, size);
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, 0, 2, size);
    for (let k = 0; k < 2; k++) { // 節
      const ky = r() * size, kx = x + 10 + r() * (plankW - 20);
      g.strokeStyle = `rgba(${dark},0.35)`; g.lineWidth = 2;
      g.beginPath(); g.ellipse(kx, ky, 5, 9, 0, 0, Math.PI * 2); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function mapTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = 384; cv.height = 256;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(192, 128, 30, 192, 128, 220);
  grad.addColorStop(0, '#e8d3a0'); grad.addColorStop(1, '#b8935a');
  g.fillStyle = grad; g.fillRect(0, 0, 384, 256);
  g.strokeStyle = '#6b4a22'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(40, 70); g.bezierCurveTo(90, 30, 120, 110, 170, 80);
  g.bezierCurveTo(220, 50, 240, 140, 300, 120); g.bezierCurveTo(330, 110, 340, 170, 320, 200); g.stroke();
  g.setLineDash([8, 7]); g.strokeStyle = '#8b1a1a';
  g.beginPath(); g.moveTo(60, 200); g.bezierCurveTo(120, 170, 160, 220, 230, 170); g.lineTo(290, 150); g.stroke();
  g.setLineDash([]); g.strokeStyle = '#8b1a1a'; g.lineWidth = 6;
  g.beginPath(); g.moveTo(280, 135); g.lineTo(304, 160); g.moveTo(304, 135); g.lineTo(280, 160); g.stroke();
  g.fillStyle = 'rgba(80,50,20,0.25)';
  for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(Math.random() * 0 + (i * 53) % 384, (i * 97) % 256, 6 + (i % 5) * 3, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export interface Scenery { update(t: number): void; dispose(): void; }

export function buildPirateScenery(scene: THREE.Scene): Scenery {
  const root = new THREE.Group();
  scene.add(root);
  const r = rng(7);
  const std = (color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
  const gold = std('#E8B923', { metalness: 0.9, roughness: 0.28 });
  const goldDark = std('#B8860B', { metalness: 0.85, roughness: 0.35 });
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; root.add(m); return m;
  };

  const coinGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.04, 16);
  const coinSets: [THREE.Material, THREE.Matrix4[]][] = [[gold, []], [goldDark, []]];
  const tmp = new THREE.Object3D();
  const addCoin = (dark: boolean, x: number, y: number, z: number, rx: number, ry: number, rz: number, parent?: THREE.Object3D) => {
    tmp.parent = parent ?? null;
    tmp.position.set(x, y, z); tmp.rotation.set(rx, ry, rz); tmp.updateMatrix();
    if (parent) { parent.updateWorldMatrix(true, false); tmp.matrixWorld.multiplyMatrices(parent.matrixWorld, tmp.matrix); }
    else tmp.matrixWorld.copy(tmp.matrix);
    (coinSets[dark ? 1 : 0] as [THREE.Material, THREE.Matrix4[]])[1].push(tmp.matrixWorld.clone());
  };

  scene.background = new THREE.Color('#150d07');
  scene.fog = new THREE.Fog('#150d07', 38, 80);

  // --- 卓 ---
  const tableTex = woodTexture('#6a4426', '30,16,6', 64, 3, [5, 4]);
  const table = mesh(new THREE.BoxGeometry(44, 0.6, 30), new THREE.MeshLambertMaterial({ map: tableTex }), 0, TABLE_Y - 0.3, 1, false);
  table.castShadow = false; table.receiveShadow = false;
  // 卓の縁(手前の船乗りたちの傷跡風の帯)
  mesh(new THREE.BoxGeometry(44, 0.25, 0.4), std('#3c2412'), 0, TABLE_Y + 0.02, 15.8, false);

  // --- 後ろの壁(船室の内壁) ---
  const wallTex = woodTexture('#3b2615', '10,5,0', 48, 11, [6, 1.4]);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(70, 22), new THREE.MeshLambertMaterial({ map: wallTex }));
  wall.position.set(0, 8, -13); wall.receiveShadow = false; root.add(wall);
  // 梁
  for (const x of [-18, -6, 6, 18]) mesh(new THREE.BoxGeometry(0.9, 22, 0.6), std('#2a190c'), x, 8, -12.7, false);
  mesh(new THREE.BoxGeometry(70, 0.9, 0.6), std('#2a190c'), 0, 3, -12.7, false);

  // 丸窓(夜の海)
  const port = new THREE.Group(); port.position.set(-9, 6, -12.6); root.add(port);
  const pr = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.22, 12, 40), goldDark); port.add(pr);
  const sea = new THREE.Mesh(new THREE.CircleGeometry(1.6, 40), new THREE.MeshBasicMaterial({ color: '#2a4a73' }));
  sea.position.z = -0.05; port.add(sea);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(0.35, 24), new THREE.MeshBasicMaterial({ color: '#f5f0c8' }));
  moon.position.set(0.5, 0.6, -0.04); port.add(moon);

  // 吊りランタン
  const lamp = new THREE.Group(); lamp.position.set(5, 11, -4); root.add(lamp);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 5, 6), std('#222')); chain.position.y = 2.5; lamp.add(chain);
  const lampBody = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.9, 8), new THREE.MeshStandardMaterial({ color: '#ffcf70', emissive: '#ff9a2e', emissiveIntensity: 1.2 }));
  lamp.add(lampBody);
  const lampCap = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.4, 8), std('#2a2a2a')); lampCap.position.y = 0.65; lamp.add(lampCap);
  const lampLight = new THREE.PointLight("#ffb060", 0, 40, 1.6); lampLight.position.set(5, 10.5, -3); root.add(lampLight);

  // --- 宝箱 ---
  const chest = new THREE.Group(); chest.position.set(-7.4, TABLE_Y, -4.2); chest.rotation.y = 0.35; root.add(chest);
  const wood = std('#5b3a1e');
  const cb = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1, 1.6), wood); cb.position.y = 0.5; cb.castShadow = true; cb.receiveShadow = true; chest.add(cb);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.6, 20, 1, false, 0, Math.PI), wood);
  lid.rotation.z = Math.PI / 2; lid.rotation.y = Math.PI / 2; lid.position.set(0, 1.0, -0.9); lid.rotation.x = -0.9; lid.castShadow = true; chest.add(lid);
  for (const x of [-1, 1]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.04, 1.64), goldDark); band.position.set(x, 0.5, 0); chest.add(band); }
  // あふれる金貨
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * 0.95;
    addCoin(r() <= 0.25, Math.cos(a) * rad * 1.1, 1.0 + (1 - rad) * 0.35 + r() * 0.1, Math.sin(a) * rad * 0.6 + 0.1,
      (r() - 0.5) * 1.2, r() * 3, (r() - 0.5) * 1.2, chest);
  }

  // --- 散らばる金貨と山 ---
  const skip = (x: number, z: number) => Math.abs(x) < 5.9 && z > -5.9 && z < 5.9;
  for (let i = 0; i < 40; i++) {
    const x = (r() - 0.5) * 30, z = (r() - 0.5) * 22 + 1;
    if (skip(x, z)) continue;
    addCoin(r() <= 0.3, x, TABLE_Y + 0.02 + (r() > 0.8 ? 0.04 : 0), z, r() > 0.9 ? 0.3 : 0, r() * 3, 0);
  }
  for (const [px, pz] of [[7.2, 3.4], [-6.6, 2.2], [7.6, -1.4]] as [number, number][]) {
    const n = 8 + Math.floor(r() * 5);
    for (let i = 0; i < n; i++) addCoin(false, px + (r() - 0.5) * 0.12, TABLE_Y + 0.03 + i * 0.045, pz + (r() - 0.5) * 0.12, 0, r() * 3, 0);
  }
  for (const [mat, ms] of coinSets) {
    const im = new THREE.InstancedMesh(coinGeo, mat, Math.max(1, ms.length));
    ms.forEach((m, i) => im.setMatrixAt(i, m));
    im.count = ms.length; im.receiveShadow = true; im.castShadow = false; root.add(im);
  }

  // --- 宝石 ---
  const gemColors = ['#d81b60', '#26c6da', '#43a047', '#7e57c2', '#e53935'];
  for (let i = 0; i < 9; i++) {
    const x = (r() - 0.5) * 28, z = (r() - 0.5) * 20 + 1;
    if (skip(x, z)) continue;
    const g = mesh(new THREE.OctahedronGeometry(0.2 + r() * 0.12), std(gemColors[i % 5] as string, { roughness: 0.15, metalness: 0.2, emissive: gemColors[i % 5] as string, emissiveIntensity: 0.15 }), x, TABLE_Y + 0.2, z);
    g.scale.y = 1.3; g.rotation.y = r() * 3;
  }

  // --- ろうそく(ゆらめく炎+光) ---
  const candle = new THREE.Group(); candle.position.set(7.2, TABLE_Y, -5); root.add(candle);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.1, 20), goldDark); dish.position.y = 0.05; candle.add(dish);
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.1, 14), std('#efe3c2')); wax.position.y = 0.65; wax.castShadow = true; candle.add(wax);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), new THREE.MeshBasicMaterial({ color: '#ffd27a' }));
  flame.scale.set(1, 1.8, 1); flame.position.y = 1.45; candle.add(flame);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff9a40', transparent: true, opacity: 0.25, depthWrite: false }));
  glow.position.set(7.2, TABLE_Y + 0.015, -5); root.add(glow);

  // --- ラム酒の瓶 ---
  const glass = std('#1f5a2c', { transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.1 });
  const bottle = (x: number, z: number, lying: boolean, ry: number) => {
    const g = new THREE.Group(); g.position.set(x, TABLE_Y, z);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.3, 16), glass); body.position.y = 0.65;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.7, 12), glass); neck.position.y = 1.6;
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 10), std('#b08850')); cork.position.y = 2.0;
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.405, 0.405, 0.5, 16, 1, true, 0, 3), std('#e8d9a8', { side: THREE.DoubleSide })); label.position.y = 0.7;
    for (const m of [body, neck, cork, label]) { m.castShadow = true; g.add(m); }
    if (lying) { const inner = new THREE.Group(); while (g.children.length) inner.add(g.children[0] as THREE.Object3D); g.add(inner); inner.rotation.z = Math.PI / 2; inner.position.y = 0.4; }
    g.rotation.y = ry; root.add(g);
  };
  bottle(8.6, -2.6, false, 0); bottle(-8.2, 4.6, true, 0.8); bottle(8.1, 6.4, true, -0.4);

  // --- 地図(巻物) ---
  const mapMat = new THREE.MeshStandardMaterial({ map: mapTexture(), roughness: 0.9, side: THREE.DoubleSide });
  const map = mesh(new THREE.PlaneGeometry(3.6, 2.4), mapMat, -7.4, TABLE_Y + 0.01, 6.6, false);
  map.rotation.set(-Math.PI / 2, 0, 0.35); map.receiveShadow = true;
  for (const s of [-1, 1]) {
    const roll = mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.6, 12), std('#c7a56a'), -7.4 + s * 1.7 * Math.cos(0.35), TABLE_Y + 0.16, 6.6 - s * 1.7 * Math.sin(0.35));
    roll.rotation.set(Math.PI / 2, 0, 0); roll.rotation.z = 0; roll.rotation.y = 0;
    roll.rotation.set(Math.PI / 2, 0, 0); roll.rotation.order = 'YXZ'; roll.rotation.y = 0.35;
  }

  // --- どくろ ---
  const skull = new THREE.Group(); skull.position.set(8.4, TABLE_Y, 2.6); skull.rotation.y = -0.9; root.add(skull);
  const bone = std('#e6e0cf', { roughness: 0.8 });
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16), bone); cranium.position.y = 0.72; cranium.castShadow = true; skull.add(cranium);
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.5), bone); jaw.position.set(0, 0.28, 0.08); jaw.castShadow = true; skull.add(jaw);
  for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), std('#111')); eye.position.set(s * 0.2, 0.76, 0.4); skull.add(eye); }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), std('#111')); nose.position.set(0, 0.6, 0.48); nose.rotation.x = Math.PI; skull.add(nose);

  // --- 短剣 ---
  const dagger = new THREE.Group(); dagger.position.set(-8.6, TABLE_Y + 0.05, -0.5); dagger.rotation.y = 0.5; root.add(dagger);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.34), std('#c9d1d9', { metalness: 0.95, roughness: 0.2 })); blade.castShadow = true; dagger.add(blade);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.9), goldDark); guard.position.x = -1.15; dagger.add(guard);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 10), std('#4a2a15')); grip.rotation.z = Math.PI / 2; grip.position.x = -1.65; dagger.add(grip);

  // --- 羅針盤 ---
  const comp = new THREE.Group(); comp.position.set(-6.4, TABLE_Y, -7.6); root.add(comp);
  const cring = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.22, 28), goldDark); cring.position.y = 0.11; cring.castShadow = true; comp.add(cring);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.04, 28), std('#efe6cc')); face.position.y = 0.23; comp.add(face);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 1.2), std('#b71c1c')); needle.position.y = 0.27; needle.rotation.y = 0.9; comp.add(needle);

  // --- 金の杯 ---
  const goblet = new THREE.Mesh(new THREE.LatheGeometry([
    [0.0, 0], [0.4, 0], [0.4, 0.06], [0.1, 0.12], [0.08, 0.55], [0.35, 0.7], [0.5, 1.2], [0.46, 1.25], [0.0, 1.0],
  ].map(([x, y]) => new THREE.Vector2(x, y)), 24), gold);
  goblet.position.set(6.2, TABLE_Y, 7.4); goblet.castShadow = true; goblet.receiveShadow = true; root.add(goblet);
  const goblet2 = goblet.clone(); goblet2.position.set(-5.4, TABLE_Y, -8.4); goblet2.rotation.z = 1.4; goblet2.position.y = TABLE_Y + 0.5; root.add(goblet2);

  // --- ロープの束 ---
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.9 - i * 0.04, 0.09, 8, 28), std('#b79a62', { roughness: 1 }));
    t.rotation.x = Math.PI / 2; t.position.set(8.8, TABLE_Y + 0.1 + i * 0.14, -0.4); t.castShadow = true; root.add(t);
  }

  // --- 樽(奥) ---
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.5, 18), std('#6b4423'));
  barrel.scale.set(1, 1, 1); barrel.position.set(2.6, TABLE_Y + 0.75, -9.4); barrel.castShadow = true; root.add(barrel);
  for (const y of [0.25, 1.25]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.91, 0.045, 6, 24), std('#2c2c2c', { metalness: 0.7 })); hoop.rotation.x = Math.PI / 2; hoop.position.set(2.6, TABLE_Y + y, -9.4); root.add(hoop); }

  return {
    update(t: number) {
      const f = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 5.3) + 0.05 * Math.sin(t * 23);
      (glow.material as THREE.MeshBasicMaterial).opacity = 0.2 * f;
      flame.scale.set(1 + 0.08 * Math.sin(t * 11), 1.8 * f, 1);
      lamp.rotation.z = 0.03 * Math.sin(t * 0.9); // 船の揺れ
      lampLight.intensity = 90 * (0.95 + 0.05 * Math.sin(t * 1.7));
    },
    dispose() {
      scene.remove(root);
      root.traverse((o) => {
        const m = o as THREE.Mesh; m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.();
      });
    },
  };
}
