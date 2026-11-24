# カベガコイ(仮称)

壁囲碁をモチーフにした 2〜3 人対戦(ホットシート)の 3D ボードゲーム。仕様は `../docs/SPEC.md`。
TypeScript + Three.js + Vite。Web(PWA)を基準に、Windows は Electron、iOS/Android は Capacitor で包む構成。

## コマンド(このディレクトリで)

```bash
npm install
npm run dev          # 開発サーバ (http://localhost:5173)
npm test             # 単体テスト (Vitest)
npm run build        # 型チェック + ビルド (dist/)
npm run test:e2e     # Playwright (desktop / mobile-portrait / mobile-landscape)
```

`?test=1` を付けて開くとテスト用フック `window.__HANG__` が有効になります。

## パッケージング(未インストールの依存は各環境で追加)

- Windows: `npm i -D electron electron-builder` → `npm run electron:dev` / `electron:build`(`package.json` の `build.win.target` に `nsis` を設定)
- Android / iOS: `npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios` → `npx cap add android|ios` → `npm run cap:sync`
- PWA: `public/manifest.webmanifest` と簡易 Service Worker (`public/sw.js`) を同梱。

## 構成

- `src/logic/` 純粋ロジック(three/DOM 非依存)。`src/render/` Three.js 描画とアニメ。`src/ui/` DOM UI。`src/app/` 入力と状態機械。
