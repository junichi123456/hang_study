# カベガコイ(仮称)— 壁囲碁アレンジ 対戦ボードゲーム 仕様書

- 文書バージョン: 1.0(2026-11-24)
- 対象読者: 実装担当。この仕様書だけを読んで実装・テストまで完了できることを目標とする。
- 表記: 「**決定事項 D-xx**」は元の要望で曖昧だった点を本仕様で確定させたもの。理由を併記する。実装者は決定事項を勝手に変更しないこと(変更が必要なら仕様書を先に更新する)。
- 定数名・型名・関数名は本書の表記どおりに実装すること(テストとフックが依存する)。

---

## 0. 目次

1. ゲーム概要
2. 技術スタック・ディレクトリ構成・コマンド
3. 座標系・方向・辺(壁)の定義
4. ゲームルール(厳密定義)
5. データモデル(型定義)
6. 状態遷移と主要関数シグネチャ
7. UI/UX 仕様
8. アニメーション仕様
9. スコープ外(AI/オンライン)
10. テスト計画
11. 実装タスク チェックリスト(マイルストーン)
12. 付録: 決定事項一覧 / 定数一覧 / ASCII 盤面フォーマット

---

## 1. ゲーム概要

- 9×9(81マス)の盤上で、2人または3人がローカルのホットシート(1台の端末を交代で操作)で対戦する。
- 各プレイヤーは **〇の駒**(固定初期位置)と **□の駒**(自由配置)を持つ。
- 手番では自分の駒を1つ動かし、移動先マスの辺に **壁を1枚建てる**(壁囲碁/Wall Go 準拠)。
- 壁で囲まれた領域に自分の駒だけがいれば、その領域のマスが自分の **支配マス** になる。
- 全プレイヤーの駒が壁で分断されたらゲーム終了。支配マス合計が最多のプレイヤーが勝利。
- 各プレイヤーはゲーム中1度だけ **壁破り** で進行方向の壁を取り除いて進める。
- 盤面は3D俯瞰表示。駒の移動アニメーションは 0.8 秒。

---

## 2. 技術スタック・ディレクトリ構成・コマンド

### 2.1 技術スタック

**決定事項 D-01: TypeScript + Three.js + Vite による Web アプリを単一コードベースとし、各OSへは以下でパッケージする。**

| 対象 | 方式 | 備考 |
|---|---|---|
| ブラウザ全般 | PWA(`vite-plugin-pwa`) | 開発・検証の主対象。このLinuxコンテナで Playwright+Chromium により検証する |
| Windows | Electron(`electron-builder` で NSIS インストーラ)。PWA インストールでも動作可 | exe 生成は Windows 機または CI で行う(コンテナでは設定ファイル作成と `vite build` 成功まで) |
| Android | Capacitor 6(`@capacitor/android`) | APK ビルドは Android SDK のある環境で行う |
| iOS | Capacitor 6(`@capacitor/ios`) | ビルドは macOS + Xcode で行う |

理由: (1) 1コードベースで3OSに届く、(2) コンテナ内の Node と Playwright+Chromium だけで実装・自動検証が完結する、(3) Three.js は WebGL で iOS/Android の WebView でも動作実績が多い。Unity/Flutter 等はコンテナでの検証が困難なため不採用。

依存バージョン(`^` 範囲で指定、`package-lock.json` をコミット):

| パッケージ | バージョン |
|---|---|
| typescript | ^5.6 |
| vite | ^5.4 |
| three / @types/three | ^0.170 |
| vitest | ^2.1 |
| @playwright/test | コンテナにインストール済みの Playwright と同じバージョン(`npx playwright --version` で確認し合わせる。ブラウザ再ダウンロードを避けるため) |
| vite-plugin-pwa | ^0.20 |
| electron / electron-builder | ^33 / ^25(devDependencies) |
| @capacitor/core, @capacitor/cli, @capacitor/android, @capacitor/ios | ^6 |

UI(HUD・画面)は **素の DOM + CSS**(フレームワーク不使用)。理由: 依存を減らし、Playwright から `data-testid` で操作しやすくするため。

### 2.2 配置場所

**決定事項 D-02: アプリ一式はリポジトリ直下の `game/` サブディレクトリに置く。**
理由: 本リポジトリ(hang_study)のルートには既存の学習用ファイル(README.md, spec/, problems/ 等)があり、`package.json` 等をルートに置くと混在するため。仕様書は `docs/SPEC.md`(本書)。

### 2.3 ディレクトリ構成

```
game/
├─ package.json
├─ package-lock.json
├─ tsconfig.json              # strict: true, noUncheckedIndexedAccess: true
├─ vite.config.ts             # vitest 設定もここに含める(test.include = tests/unit/**)
├─ playwright.config.ts
├─ capacitor.config.ts        # appId: "com.example.kabegakoi", webDir: "dist"
├─ index.html
├─ electron/
│   └─ main.cjs               # dist/index.html を読み込むだけの最小 Electron メイン
├─ public/
│   ├─ icons/ (192, 512 png)  # 単色背景+〇□の簡易アイコンで可
│   └─ (manifest は vite-plugin-pwa で生成)
├─ src/
│   ├─ logic/                 # ★純粋ロジック。three / DOM / window / Date / Math.random を参照禁止
│   │   ├─ constants.ts       # BOARD_SIZE, 初期位置表, MAX_TURNS など
│   │   ├─ types.ts           # 5章の型
│   │   ├─ board.ts           # 座標・方向・辺ユーティリティ
│   │   ├─ setup.ts           # createGame, 配置フェーズ
│   │   ├─ moves.ts           # 合法手列挙, applyMove
│   │   ├─ walls.ts           # 壁候補, applyWall
│   │   ├─ regions.ts         # フラッドフィル, 領域計算
│   │   ├─ scoring.ts         # スコア, 順位判定
│   │   ├─ turn.ts            # 手番進行, 終了判定
│   │   ├─ serialize.ts       # JSON 変換(テストフック用)
│   │   └─ index.ts           # 公開 API の再エクスポート
│   ├─ render/                # Three.js 依存はここだけ
│   │   ├─ scene.ts           # renderer/scene/light/リサイズ
│   │   ├─ camera.ts          # 俯瞰カメラとフィット計算
│   │   ├─ boardView.ts       # 盤・枠・マス
│   │   ├─ pieceView.ts       # 駒メッシュ
│   │   ├─ wallView.ts        # 壁メッシュ・ゴースト壁
│   │   ├─ highlightView.ts   # 移動先ハイライト・経路表示・領域色
│   │   ├─ picking.ts         # レイキャスト → セル/盤上座標
│   │   ├─ animator.ts        # アニメーション管理(入力ロック判定の源)
│   │   └─ animMath.ts        # ★純粋関数(イージング・経路補間)。Vitest 対象
│   ├─ ui/
│   │   ├─ titleScreen.ts
│   │   ├─ hud.ts
│   │   ├─ resultScreen.ts
│   │   ├─ rulesModal.ts
│   │   └─ styles.css
│   ├─ app/
│   │   ├─ controller.ts      # 入力→ロジック呼出→描画イベント の調停(UI状態機械)
│   │   └─ settings.ts        # localStorage(設定のみ)
│   ├─ testHooks.ts           # window.__HANG__(10.3 節)
│   └─ main.ts
└─ tests/
    ├─ helpers/
    │   └─ boardFixture.ts    # ASCII 盤面 → GameState(12.3 節)
    ├─ unit/                  # Vitest
    │   ├─ board.test.ts
    │   ├─ setup.test.ts
    │   ├─ moves.test.ts
    │   ├─ walls.test.ts
    │   ├─ regions.test.ts
    │   ├─ scoring.test.ts
    │   ├─ turn.test.ts
    │   ├─ animMath.test.ts
    │   └─ purity.test.ts
    └─ e2e/                   # Playwright
        ├─ fixtures/*.json
        └─ *.spec.ts
```

### 2.4 コマンド(すべて `game/` で実行)

| npm script | 内容 |
|---|---|
| `npm install` | 依存導入 |
| `npm run dev` | `vite --host 0.0.0.0 --port 5173` |
| `npm run build` | `tsc --noEmit && vite build`(出力 `dist/`) |
| `npm run preview` | `vite preview --host 0.0.0.0 --port 4173` |
| `npm test` | `vitest run` |
| `npm run test:watch` | `vitest` |
| `npm run test:e2e` | `playwright test`(webServer で `npm run build && npm run preview` を起動、baseURL `http://localhost:4173`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run electron:dev` | `vite build && electron electron/main.cjs` |
| `npm run electron:build` | `vite build && electron-builder --win nsis`(Windows/CI 用) |
| `npm run cap:sync` | `vite build && npx cap sync` |

Playwright 設定:
- projects: `desktop`(1280×720)、`mobile-portrait`(390×844, isMobile, hasTouch)、`mobile-landscape`(844×390, isMobile, hasTouch)。ブラウザはすべて Chromium。
- `launchOptions.args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']`(ヘッドレスで WebGL を有効にするため)。
- `retries: 0`、`trace: 'retain-on-failure'`、スクリーンショットは `test-results/` に保存。

`vite.config.ts` は `base: './'`(Electron/Capacitor でファイル相対パス読込のため)。

---

## 3. 座標系・方向・辺(壁)の定義

### 3.1 セル座標

- セル `(x, y)`。**x = 列(左→右)、y = 行(奥→手前)、いずれも 0 始まり、0..8**。
- 画面上では y=0 が奥(カメラから遠い側)、y=8 が手前。
- セルの一次元インデックス `idx = y * 9 + x`(0..80)。

```
        x→ 0 1 2 3 4 5 6 7 8
   y=0     . . . . . . . . .    (奥)
   y=1     . . . . . . . . .
   y=2     . . ◎ . . . ◎ . .    ◎ = 〇の初期位置候補 (2,2) (6,2)
   y=3     . . . . . . . . .
   y=4     . . . . . . . . .
   y=5     . . . . . . . . .
   y=6     . . ◎ . . . ◎ . .    ◎ = (2,6) (6,6)
   y=7     . . . . . . . . .
   y=8     . . . . . . . . .    (手前・カメラ側)
```

### 3.2 方向

| Dir | dx | dy | 意味 |
|---|---|---|---|
| `'N'` | 0 | -1 | 奥へ(y 減少) |
| `'E'` | +1 | 0 | 右へ |
| `'S'` | 0 | +1 | 手前へ(y 増加) |
| `'W'` | -1 | 0 | 左へ |

- 列挙順は常に `DIRS = ['N','E','S','W']`(合法手の列挙順を決定的にするため)。
- `perpendicular('N') = ['E','W']`、`perpendicular('E') = ['N','S']` …(返す順は DIRS 順)。
- `opposite('N')='S'` など。

### 3.3 辺(壁が建つ場所)

壁は **マスとマスの間の辺** に建つ(D-04 参照)。辺は次の2種類で表す。

| 種別 | 表記 | 隔てる2マス | 範囲 | 配列インデックス |
|---|---|---|---|---|
| 横辺 H | `{o:'H', x, y}` | `(x, y)` と `(x, y+1)`(上下) | x: 0..8, y: 0..7 | `hIdx = y*9 + x`(72本) |
| 縦辺 V | `{o:'V', x, y}` | `(x, y)` と `(x+1, y)`(左右) | x: 0..7, y: 0..8 | `vIdx = y*8 + x`(72本) |

- 内部辺は合計 144 本。盤の外周は「常に壁がある」扱いで、配列には持たない(外周は壊せない・建てられない)。
- `edgeBetween(a, b)`: 隣接2マス間の辺を返す。
  - b が a の S(y+1) → `H(a.x, a.y)`、N → `H(a.x, a.y-1)`、E → `V(a.x, a.y)`、W → `V(a.x-1, a.y)`。
- `edgeKey(e)`: `"H:x,y"` / `"V:x,y"` の文字列(比較・Set 用)。
- `edgesOfCell(c)`: セル c の4辺のうち **内部辺のみ** を DIRS 順(N,E,S,W)で返す。角マスは2本、辺マスは3本、内側は4本。

---

## 4. ゲームルール(厳密定義)

### 4.1 プレイヤーと親

- 2人戦: P0, P1。3人戦: P0, P1, P2。内部 ID は 0 始まり、画面表示は「プレイヤー1/2/3」。
- **決定事項 D-03: 親 = P0(プレイヤー1)。手番順は P0→P1(→P2)→P0… の固定時計回り。** 配置フェーズ・移動フェーズとも親から始める。理由: 要望「親から順に」を最も素直に満たし、ホットシートで分かりやすい。

### 4.2 駒の数と〇の初期位置

**決定事項 D-05: 駒数と〇の割当**

| 人数 | 〇 / 人 | □ / 人 | 合計 / 人 | 〇の初期位置 |
|---|---|---|---|---|
| 2人 | 2 | 2 | 4 | P0: (6,2), (2,6) / P1: (2,2), (6,6) |
| 3人 | 1 | 2 | 3 | P0: (2,6) / P1: (6,2) / P2: (6,6) / (2,2) は空きマス |

理由:
- 「各辺からちょうど3ブロック目(角から2マス内側)」を満たすマスは (2,2),(6,2),(2,6),(6,6) の4点のみ。2人戦ではこれを全部使い、対角で割り当てて点対称にする。
- 3人戦では4点を3人で割れないため1人1個とし、1点を空ける。(6,6) の P2 は両隣を他者に挟まれる位置だが、P2 は □ の配置を最後に行える(相手を見てから置ける)ことで相殺する。バランス調整が必要になったら `CIRCLE_START` 定数表だけを変更すればよい構造にする。
- □ は各2個:2人戦で盤上 8 駒、3人戦で 9 駒。81マスに対し壁で囲う余地が十分残る数。

`constants.ts`:
```ts
export const CIRCLE_START: Record<2 | 3, Cell[][]> = {
  2: [ [{x:6,y:2},{x:2,y:6}], [{x:2,y:2},{x:6,y:6}] ],
  3: [ [{x:2,y:6}], [{x:6,y:2}], [{x:6,y:6}] ],
};
export const SQUARES_PER_PLAYER = 2;
```

駒 ID: `"p{player}-c{n}"`(〇)、`"p{player}-s{n}"`(□)。n は 0 始まり。例: `p0-c0`, `p1-s1`。

### 4.3 □の配置フェーズ

- ゲーム開始直後、〇は初期位置に置かれた状態で配置フェーズに入る。
- 配置順(placementQueue):
  - 2人: `[0, 1, 0, 1]`
  - 3人: `[0, 1, 2, 0, 1, 2]`
- 先頭のプレイヤーが □ を1個、**空いている任意のマス**(他の駒がないマス)に置く。制約はそれだけ(3人戦の空き (2,2) にも置ける)。
- キューが空になったら移動フェーズへ。手番は P0。

### 4.4 手番の流れ(移動フェーズ)

1手番 = 「駒を1つ移動」→「移動先マスの辺に壁を1枚建てる」。

1. **駒選択**: 手番プレイヤーは、合法手を1つ以上持つ自分の駒を1つ選ぶ。
2. **移動**: 4.5 の規則で 1〜2 マス移動する。**移動0(その場に留まる)は不可**。
3. **壁設置**: 移動後のマス(移動先セル)の `edgesOfCell` のうち、まだ壁がない辺から1本を選んで壁を建てる。**必須**。ただし候補が0本なら壁設置は省略して手番終了。
4. 手番終了処理(4.9)。

**決定事項 D-04: 壁の生成方式 = 「移動後、移動先マスの4辺のいずれかに壁を1枚建てる」(Wall Go/壁囲碁の標準ルール)。**
理由: 「駒の軌跡に自動で壁が残る」方式は1手で最大2〜3枚の壁が強制的にでき、□の2マス直進で盤が急速に分断されて戦略性が薄くなる。標準ルールの「1手1枚・建てる位置を選ぶ」方式の方が囲碁的な陣取りの駆け引きが残り、壁破り(1枚除去)との釣り合いも良い。

壁の所有者(建てたプレイヤー)は記録するが、**所有者は見た目の色にのみ使い、ルール上の意味はない**(誰でも任意の壁に阻まれ、壁破りはどの壁にも使える)。

### 4.5 移動規則

共通:
- 1歩 = 隣接マス(上下左右)へ移動。斜め移動なし。
- 1歩の **移動先マスに駒(自他問わず)があれば不可**。駒を飛び越すことも不可(2歩目の途中マスも空いている必要がある=1歩目が合法である必要がある)。
- 1歩で **壁のある辺を越えることは不可**。例外: 壁破り(4.6)。
- 盤外へは出られない(外周は壁で、壁破り不可)。
- 移動中の駒自身の元マスは空きとみなす(ただし下記規則上、元マスに戻る手は存在しない)。

**〇の駒(Circle)**:
- 1歩目: 任意の方向 d1 へ1マス。ここで止まってもよい(1マス移動)。
- 2歩目(任意): 1歩目の到着マスから、d1 に **直交する方向**(90度曲がる)d2 へ1マス。
- d2 = d1(直進2マス)は不可。d2 = opposite(d1)(来たマスへ戻る)は不可。
- 到達可能なマス: 4近傍(1歩)+ 斜め4マス(L字2歩)= 最大8マス。斜めマスへの経路は2通り(例: E→N と N→E)あり得る。

**□の駒(Square)**:
- 方向 d を1つ選び、d へ1マスまたは2マス直進。方向転換不可。
- 2マス目に進むには1マス目が合法で(空き・壁なしまたは壁破り)、かつ2マス目も合法であること。
- 到達可能なマス: 各方向に最大2マス、最大8マス。

### 4.6 壁破り

- 各プレイヤーはゲーム中 **1回だけ** 使える(`wallBreakUsed[player]`)。
- 移動の **いずれか1歩** で、その歩で越える辺に壁がある場合、壁破りを使ってその壁を **永久に取り除き**、その歩を進める。
- 1回の移動で破れる壁は最大1枚(2枚の壁を越える経路は不可)。
- 外周(盤端)には使えない。駒のあるマスへ進む目的には使えない(壁を破っても駒がいれば不可)。
- 壁破りを使った移動を確定した時点で `wallBreakUsed[player] = true`。壁破りだけを単独で使う(移動しない)ことはできない。
- 壁破り後も通常どおり壁設置(4.4-3)を行う。取り除いた辺に再び壁を建てることも、それが移動先マスの辺であれば可能。
- 壁破りで囲いが開いた場合、領域は次回の計算時に自然に変わる(特別処理なし)。

**決定事項 D-06: 壁破りは「移動の一部」としてのみ使える。** 理由: 要望の「進行方向の壁を取り除ける」を、進行に伴う効果として最も直接的に解釈した。単独使用を許すと実質「壁を消すだけの手」になり、手番の定義(移動必須)と矛盾するため。

### 4.7 領域(リージョン)と支配マス

- **領域** = 内部辺のうち壁がない辺でつながったセルの連結成分(4近傍フラッドフィル)。駒は連結を妨げない。外周は常に閉じている。
- 各領域について `owners` = その領域内に駒を1つ以上持つプレイヤーの集合。
- 領域の帰属:
  - `owners` がちょうど1人 → その領域の全セル(駒のあるセルも含む)がそのプレイヤーの **支配マス**。
  - `owners` が0人(駒がいない閉領域) → **中立**。誰の支配マスでもない。
  - `owners` が2人以上 → **未確定**。誰の支配マスでもない。
- **支配マス合計** `territory(p)` = p が単独所有する全領域のセル数の和。
- この計算はゲーム中も常に行い、HUD に「確定支配マス」として表示する。

**決定事項 D-07: 複数プレイヤー共存領域・駒なし領域はいずれの支配マスにも数えない。** 理由: 壁囲碁の「自分の駒だけを囲った領域が得点」という原則に一致させるため。3人戦で2人が同じ領域にいる場合もこの規則で一意に決まる。

### 4.8 決着状態(プレイヤーの確定)

- プレイヤー p が **確定(settled)** = p の全駒が、`owners = {p}` の領域に入っている状態。
- 確定したプレイヤーの手番は **自動でスキップ** する(移動も壁設置もしない)。
- 他者の壁破りで p の領域に他者の駒が入ると、p は確定でなくなり、手番が再び回ってくる(毎手番開始時に動的判定)。

**決定事項 D-08: 確定プレイヤーはスキップ。** 理由: 確定後も移動と壁設置を強制すると、自分の領域を自分の壁で分割して駒のいない中立領域を作らされる(自損を強いられる)ため。

### 4.9 手番終了処理とゲーム終了条件

手番終了処理 `advanceTurn` は次の順で行う(移動+壁設置の完了後、または壁候補0本で壁設置省略後)。

1. `turnCount += 1`、`consecutivePasses = 0`(実際に移動した手番の場合)。
2. **分断判定**: すべての領域で `owners.length <= 1` なら終了(理由 `'separated'`)。
3. **手数上限**: `turnCount >= MAX_TURNS (=200)` なら終了(理由 `'turnLimit'`)。
4. 次のプレイヤー p を手番順に探す(最大 playerCount 回ループ):
   - p が確定 → イベント `playerSkipped`、次へ。
   - p に合法手が1つもない → **パス**: イベント `turnPassed`、`turnCount += 1`、`consecutivePasses += 1`。
     - `consecutivePasses >= 未確定プレイヤー数` なら終了(理由 `'allPassed'`)。
     - `turnCount >= MAX_TURNS` なら終了(理由 `'turnLimit'`)。
     - 次へ。
   - それ以外 → `currentPlayer = p`, `phase = 'move'`, イベント `turnStarted`、ループ終了。
   - ループが一周しても手番が決まらない場合は終了(理由 `'allPassed'`)。(安全策)

**決定事項 D-09: 終了条件は (a) 全員分断、(b) 総手数 200 到達、(c) 未確定プレイヤー全員の連続パス。** 理由: 壁囲碁の本来の終了条件は (a)。壁破りによる囲い崩しや移動不能での停滞があっても必ず終わるよう (b)(c) を安全弁として置く。内部辺144本+壁破り最大3回なので通常は (a) で 150 手以内に終わる。

### 4.10 勝敗判定

ゲーム終了時、4.7 の規則で各プレイヤーのスコアを計算する。

- 第1基準: `territory(p)`(支配マス合計)が多い方が上位。
- 第2基準(同点時): **1コマあたり支配マス数 `efficiency(p)`** が多い方が上位。
- 第3基準: それも同値なら **同順位(引き分け)**。同順位が1位なら「引き分け(共同勝利)」と表示。

**決定事項 D-10: `efficiency(p)` の定義**

```
efficiency(p) = max over 領域 R (owners(R) = {p}) of  |R| / n_p(R)
  |R|    : 領域 R のセル数
  n_p(R) : 領域 R 内の p の駒数(≥1)
p が単独所有する領域がなければ efficiency(p) = 0
```

理由: 「支配マス合計 ÷ 全駒数」と解釈すると、全員の駒数が同じ(2人戦4駒・3人戦3駒)なので同点時に必ず同値になり、タイブレークとして機能しない。そこで「その領域を支配するのに使った駒1つあたりのマス数」を領域ごとに求め、最も効率よく囲えた領域の値を採る。少ない駒で大きく囲ったプレイヤーを評価する、要望の意図に沿った指標である。

比較は浮動小数を避け、分数の交差乗算で行う:
`a.cells / a.pieces > b.cells / b.pieces ⇔ a.cells * b.pieces > b.cells * a.pieces`

順位は「競技順位」方式(1,1,3)。`decidedBy`:
- 1位が第1基準だけで単独に決まった → `'territory'`
- 第1基準で同点だった1位候補が第2基準で単独に決まった → `'efficiency'`
- 1位が複数 → `'draw'`

### 4.11 ルール例

```
例: 〇 at (4,4)、周囲に駒も壁もない
  1歩: (4,3) (5,4) (4,5) (3,4)
  L字: (3,3) (5,3) (5,5) (3,5)  ※各2経路
  不可: (4,2) 直進2マス / (4,4) 戻り

例: □ at (4,4)、周囲に駒も壁もない
  (4,3) (4,2) (5,4) (6,4) (4,5) (4,6) (3,4) (2,4)
```

---

## 5. データモデル(型定義)

`src/logic/types.ts`(このとおり実装する):

```ts
export type PlayerId = 0 | 1 | 2;
export type PlayerCount = 2 | 3;
export type Dir = 'N' | 'E' | 'S' | 'W';
export type PieceKind = 'circle' | 'square';

export interface Cell { x: number; y: number; }

export interface Edge { o: 'H' | 'V'; x: number; y: number; }

/** 壁配列の値: -1 = 壁なし, 0..2 = 建てたプレイヤー, 3 = 中立(テスト用フィクスチャ) */
export type WallValue = -1 | 0 | 1 | 2 | 3;
export const NO_WALL = -1;
export const NEUTRAL_WALL = 3;

export interface Piece {
  id: string;          // "p0-c0" など
  owner: PlayerId;
  kind: PieceKind;
  pos: Cell;
}

export interface GameConfig {
  playerCount: PlayerCount;
  playerNames: string[];   // 長さ = playerCount。空なら "プレイヤーN"
}

export type Phase = 'placement' | 'move' | 'wall' | 'finished';

export interface Move {
  pieceId: string;
  dirs: Dir[];             // 長さ1または2
  path: Cell[];            // 通過・到着セル(開始セルを含まない)。長さ = dirs.length
  breakEdge: Edge | null;  // 壁破りで除去する辺。なければ null
}

export interface PendingWall {
  pieceId: string;
  cell: Cell;              // 移動先セル
}

export type EndReason = 'separated' | 'turnLimit' | 'allPassed';

export interface PlayerScore {
  player: PlayerId;
  territory: number;
  bestRegionCells: number;   // efficiency の分子(なければ 0)
  bestRegionPieces: number;  // efficiency の分母(なければ 1)
}

export interface RankEntry { player: PlayerId; rank: number; score: PlayerScore; }

export interface GameResult {
  reason: EndReason;
  ranking: RankEntry[];      // rank 昇順、同順位は player 昇順
  winners: PlayerId[];
  decidedBy: 'territory' | 'efficiency' | 'draw';
}

export interface Region {
  id: number;                // 0..(領域数-1)。最小 idx のセルが小さい順
  cells: Cell[];             // idx 昇順
  owners: PlayerId[];        // 昇順
  piecesByPlayer: number[];  // 長さ playerCount
}

export type LogEntry =
  | { t: 'place'; player: PlayerId; pieceId: string; cell: Cell }
  | { t: 'move'; player: PlayerId; move: Move }
  | { t: 'wall'; player: PlayerId; edge: Edge }
  | { t: 'pass'; player: PlayerId }
  | { t: 'skip'; player: PlayerId };

export interface GameState {
  config: GameConfig;
  phase: Phase;
  currentPlayer: PlayerId;
  pieces: Piece[];             // 生成順固定(p0-c*, p0-s*, p1-c*, ...)
  hWalls: WallValue[];         // 長さ 72, index = y*9+x
  vWalls: WallValue[];         // 長さ 72, index = y*8+x
  wallBreakUsed: boolean[];    // 長さ playerCount
  placementQueue: PlayerId[];  // 残りの□配置順
  pendingWall: PendingWall | null; // phase==='wall' のときのみ非 null
  turnCount: number;           // 移動フェーズの完了手番数(パス含む)
  consecutivePasses: number;
  log: LogEntry[];
  result: GameResult | null;   // phase==='finished' のときのみ非 null
}

export type GameEvent =
  | { type: 'squarePlaced'; pieceId: string; cell: Cell }
  | { type: 'phaseChanged'; phase: Phase }
  | { type: 'pieceMoved'; pieceId: string; from: Cell; path: Cell[]; brokenEdge: Edge | null }
  | { type: 'wallPlaced'; edge: Edge; owner: PlayerId }
  | { type: 'wallSkipped'; cell: Cell }          // 壁候補0本
  | { type: 'turnStarted'; player: PlayerId }
  | { type: 'turnPassed'; player: PlayerId }
  | { type: 'playerSkipped'; player: PlayerId }
  | { type: 'gameEnded'; result: GameResult };

export type ErrorCode =
  | 'WRONG_PHASE' | 'OUT_OF_BOUNDS' | 'CELL_OCCUPIED'
  | 'NOT_YOUR_PIECE' | 'ILLEGAL_MOVE' | 'ILLEGAL_WALL' | 'UNKNOWN_PIECE';

export type ActionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: ErrorCode };
```

原則:
- **GameState はイミュータブル**。すべての操作関数は新しいオブジェクトを返し、引数を変更しない(テストで `structuredClone` 前後比較により検証)。
- GameState は JSON シリアライズ可能(関数・Map・Set・クラスを含めない)。
- ロジックは乱数・時刻を使わない(決定的)。

---

## 6. 状態遷移と主要関数シグネチャ

### 6.1 状態遷移図

```
createGame
   │
   ▼
[placement] ──placeSquare×(2×人数)──▶ [move] ◀──────────────┐
                                       │ applyMove           │
                                       ▼                     │
                              壁候補あり? ──no──▶ advanceTurn ─┤
                                       │yes                  │
                                       ▼                     │
                                    [wall] ──applyWall──▶ advanceTurn
                                                             │
                                               終了条件成立 ──▶ [finished]
```

- 配置の最後の1個を置いた直後: `phase='move'`, `currentPlayer=0`、イベント `phaseChanged('move')`, `turnStarted(0)`。(移動フェーズ開始時点で P0 が合法手なし・確定ということは起こり得ないが、念のため advanceTurn と同じ探索ロジックで最初の手番を決めてよい。)
- `applyMove` 成功 → 駒移動・(壁破りなら)壁除去・`wallBreakUsed` 更新 → 壁候補があれば `phase='wall'`, `pendingWall` 設定。なければ `wallSkipped` イベント後 `advanceTurn`。
- `applyWall` 成功 → 壁設置 → `pendingWall=null` → `advanceTurn`。
- `advanceTurn` は 4.9 のとおり。終了時は `phase='finished'`, `result=rankPlayers(computeScores(state), reason)`、イベント `gameEnded`。

### 6.2 関数シグネチャ(`src/logic/index.ts` から公開)

```ts
// board.ts
export const BOARD_SIZE = 9;
export const DIRS: readonly Dir[];                 // ['N','E','S','W']
export function inBounds(c: Cell): boolean;
export function cellIdx(c: Cell): number;
export function neighbor(c: Cell, d: Dir): Cell | null;   // 盤外なら null
export function opposite(d: Dir): Dir;
export function perpendicular(d: Dir): Dir[];
export function edgeBetween(a: Cell, b: Cell): Edge;      // 非隣接なら例外
export function edgeKey(e: Edge): string;
export function edgesOfCell(c: Cell): Edge[];             // 内部辺のみ, N,E,S,W 順
export function hasWall(s: GameState, e: Edge): boolean;
export function pieceAt(s: GameState, c: Cell): Piece | undefined;

// setup.ts
export function createGame(config: GameConfig): GameState;
export function legalPlacementCells(s: GameState): Cell[];   // idx 昇順
export function placeSquare(s: GameState, cell: Cell): ActionResult;

// moves.ts
export function legalMovesForPiece(s: GameState, pieceId: string): Move[];
export function legalMoves(s: GameState, player?: PlayerId): Move[]; // 既定 = currentPlayer, pieces 配列順に連結
export function movablePieceIds(s: GameState): string[];
export function applyMove(s: GameState, move: Move): ActionResult;
/** UI 用: 到着セルごとに代表手を1つ選ぶ(6.3) */
export function representativeMoves(moves: Move[]): Move[];

// walls.ts
export function wallOptions(s: GameState, cell: Cell): Edge[];   // 壁のない内部辺, N,E,S,W 順
export function applyWall(s: GameState, edge: Edge): ActionResult;

// regions.ts
export function computeRegions(s: GameState): Region[];
export function isSeparated(s: GameState): boolean;
export function isSettled(s: GameState, p: PlayerId): boolean;
export function cellOwnerMap(s: GameState): (PlayerId | null)[]; // 長さ81, 単独所有者 or null

// scoring.ts
export function computeScores(s: GameState): PlayerScore[];       // player 昇順
export function compareEfficiency(a: PlayerScore, b: PlayerScore): number; // >0 なら a が上
export function rankPlayers(scores: PlayerScore[], reason: EndReason): GameResult;

// turn.ts
export function advanceTurn(s: GameState, events: GameEvent[]): { state: GameState; events: GameEvent[] };

// serialize.ts
export function serialize(s: GameState): string;
export function deserialize(json: string): GameState;   // 形の検証を行い不正なら例外
```

### 6.3 合法手列挙アルゴリズム(`legalMovesForPiece`)

```
前提: phase==='move' かつ piece.owner===currentPlayer でなければ [] を返す
canBreak = !wallBreakUsed[owner]
occupied(c) = c に「動かす駒以外」の駒がある

tryStep(from, d, breakUsedSoFar):
  to = neighbor(from, d); if !to → 不可
  if occupied(to) → 不可
  e = edgeBetween(from, to)
  if hasWall(e):
     if canBreak && breakUsedSoFar==null → 可, 破る辺 = e
     else → 不可
  else → 可, 破る辺 = breakUsedSoFar

Circle:
  for d1 of DIRS:
    r1 = tryStep(start, d1, null); if 不可 continue
    push Move(dirs=[d1], path=[c1], breakEdge=r1.break)
    for d2 of perpendicular(d1):           // DIRS 順
      r2 = tryStep(c1, d2, r1.break); if 不可 continue
      push Move(dirs=[d1,d2], path=[c1,c2], breakEdge=r2.break)

Square:
  for d of DIRS:
    r1 = tryStep(start, d, null); if 不可 continue
    push Move([d], [c1], r1.break)
    r2 = tryStep(c1, d, r1.break); if 不可 continue
    push Move([d,d], [c1,c2], r2.break)
```

- 列挙順はこの擬似コードの順で固定(テストで順序も検証する)。
- `applyMove(s, move)` は `legalMovesForPiece(s, move.pieceId)` に、`dirs` と `breakEdge`(edgeKey 比較、null 同士一致)が一致する手が含まれるか確認し、なければ `ILLEGAL_MOVE`。

`representativeMoves(moves)`: 到着セル(path の末尾)ごとにグループ化し、各グループから「breakEdge が null の手を優先、同条件なら列挙順で先のもの」を1つ選ぶ。返却順は最初に現れた順。UI は代表手でハイライトし、確定時に代表手を applyMove に渡す。
- 同じ到着セルに「壁破りなし」と「壁破りあり」の経路がある場合、壁破りは使わない(プレイヤーに不利な選択を勝手にしない)。

### 6.4 領域計算(`computeRegions`)

```
visited[81] = false; regions = []
for idx in 0..80:
  if visited[idx] continue
  BFS/スタックで、隣接かつ edgeBetween に壁がないセルへ広げる
  cells を idx 昇順にソート
  piecesByPlayer = 各プレイヤーの駒数(その領域内)
  owners = piecesByPlayer[p] > 0 の p
  regions.push({ id: regions.length, cells, owners, piecesByPlayer })
```
計算量は 81 セル・144 辺で十分小さいため、キャッシュ不要(毎回再計算)。

### 6.5 スコア計算(`computeScores`)

```
for p:
  territory = Σ |R|  (R.owners = [p])
  best = (cells=0, pieces=1)
  for R with owners=[p]:
     cand = (|R|, R.piecesByPlayer[p])
     if cand.cells * best.pieces > best.cells * cand.pieces: best = cand
     同値なら cells が大きい方を保持(表示上の都合。順位には影響しない)
```

---

## 7. UI/UX 仕様

### 7.1 画面構成

1. **タイトル/設定画面**(`data-testid="title-screen"`)
   - ゲーム名、人数選択トグル「2人」「3人」(`player-count-2`, `player-count-3`、既定は前回値、初回 2)。
   - プレイヤー名入力(人数分、任意、最大12文字、`name-input-{p}`)。空欄は「プレイヤーN」。
   - 「ゲーム開始」(`start-button`)、「ルール」(`rules-button` → `rules-modal`、閉じるボタン `rules-close`)。
   - 設定(人数・名前)は localStorage `hang.settings.v1` に保存。localStorage 不可でも動作すること(try/catch)。
2. **ゲーム画面**: 3D キャンバス + HUD。
3. **結果画面**(`result-screen`): ゲーム画面の上にモーダル表示。盤面は領域着色状態で背後に見える。

ホットシート: 1台を交代で使う。手番交代時に画面中央へ「プレイヤー2の番です」バナー(`turn-banner`)を 900ms 表示(入力はブロックしない)。完全情報ゲームなので画面を隠す処理は不要。

### 7.2 レイアウトとレスポンシブ

- ルート要素は `100dvh` × `100vw`、ページスクロールなし、`overscroll-behavior: none`。
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">`。キャンバスに `touch-action: none`。
- セーフエリア: HUD に `padding: env(safe-area-inset-*)` を適用。
- **縦長(幅/高さ < 1.0)**: 上部に HUD(高さ自動、最大 30vh)、下部(残り全部)にキャンバス。確定/キャンセルボタンはキャンバス下端に重ねず HUD 下部に配置。
- **横長(幅/高さ ≥ 1.0)**: 左に HUD パネル(幅 260px、幅 < 700px の端末では 200px)、右に残りをキャンバス。
- HUD はキャンバスと **重ならない**(flex で領域を分ける)。キャンバスサイズ変化時は ResizeObserver でレンダラとカメラを更新。
- 最小対応サイズ: 360×640(縦)、640×360(横)。

### 7.3 HUD 表示項目(`data-testid="hud"`)

| 項目 | testid | 内容 |
|---|---|---|
| 現手番 | `hud-current-player` | プレイヤー色のチップ+名前 |
| フェーズ案内 | `hud-phase` | 例:「□を置くマスを選んでください(残り2)」「動かす駒を選んでください」「移動先を選んでください」「壁を建てる辺を選んでください」 |
| 各プレイヤーのスコア | `hud-score-{p}` | 確定支配マス数(4.7)。手番プレイヤーの行を強調 |
| 壁破り残 | `hud-break-{p}` | 「壁破り 1」/「壁破り 0」(使用済みはグレーアウト) |
| 手数 | `hud-turn` | 「手数 12 / 200」 |
| 確定 | `confirm-button` | 選択中の配置/移動/壁を確定。選択なしの時は disabled。壁破り経路選択中はラベル「壁破りして移動」 |
| キャンセル | `cancel-button` | 移動フェーズの駒/移動先選択を解除。壁フェーズでは非表示 |
| メニュー | `menu-button` | 「タイトルへ戻る」(確認ダイアログ `confirm-quit` あり)、「ルール」 |

### 7.4 操作方法(タップ/クリック共通、Pointer Events で実装)

入力は `pointerdown`→`pointerup` の移動距離が 10px 以下のものを「タップ」として扱う。ホバーは使わない(モバイル同等の体験にするため)。

**配置フェーズ**
1. 合法配置セル(空きマス)を薄い白でハイライト。
2. セルをタップ → そのセルに半透明の□(ゴースト)を表示=選択。
3. 同じセルをもう一度タップ、または「確定」で配置。別セルのタップで選択変更。

**移動フェーズ**
1. 手番プレイヤーの動かせる駒の足元にリング表示(パルス)。
2. 駒をタップ → 選択(駒が 0.15 浮き、発光)。代表手の到着セルをハイライト:
   - 通常: 緑 `#7CFC00`、不透明度 0.45
   - 壁破りが必要: オレンジ `#FF9800`、不透明度 0.55
3. ハイライトセルをタップ → 経路プレビュー(経路に沿った細い線、壁破りなら破る壁を赤く点滅)。
4. 同じセルを再タップ、または「確定」→ 移動アニメ(8章)。壁破り経路は確定前に HUD フェーズ案内に「壁破りを使用します(ゲーム中1回)」を表示する(追加のダイアログは出さない)。
5. 選択中に別の自駒をタップ → 選択切替。何もない場所 or 「キャンセル」→ 選択解除。

**壁フェーズ**
1. 移動先セルの壁候補辺(`wallOptions`)に、手番プレイヤー色のゴースト壁(不透明度 0.35)を表示。
2. タップ位置(盤面平面との交点)から最も近い候補辺の中点を選ぶ(距離 0.9 以内のみ有効)→ そのゴーストを不透明度 0.8 に=選択。
3. 同じ辺を再選択、または「確定」で壁設置(壁出現アニメ)。
4. 壁フェーズはキャンセル不可(移動は確定済み)。

**アニメーション中の入力**: すべて無視(8.5)。

### 7.5 3D 表示仕様

**ワールド座標**: 1マス = 1.0 ユニット。盤平面は y=0(Three.js の Y 上向き)。セル (x, y) の中心 = `(x - 4, 0, y - 4)`(ロジックの y はワールド Z)。

**カメラ**(`render/camera.ts`):
- `PerspectiveCamera`、垂直 FOV 40°。
- 注視点 `(0, 0, 0.3)`。カメラはプレイヤー手前側(+Z)から見下ろす。仰角 58°(水平面からの角度)、方位 0。
- 距離のフィット: 盤(枠込み半幅 5.1)を包む半径 `R = 6.4` の球が収まる距離 `d = R / sin(min(vFov, hFov)/2)`、`hFov = 2·atan(tan(vFov/2)·aspect)`。d は 10〜60 にクランプ。リサイズごとに再計算。
- カメラ固定(ユーザーによる回転・ズームなし)。
- 受け入れ基準: 360×640, 390×844, 844×390, 1280×720, 1920×1080 で、盤外周4隅の投影座標がキャンバス内側 8px 以上の余白をもって収まる(E2E で検証)。

**盤**:
- マス: 81 枚の平面(0.96×0.96)を市松風に `#D9B98A` / `#CFAE7E`。マス間は 0.04 の溝(下地 `#8D6E4F`)。
- 外周枠: 高さ 0.5、厚さ 0.3 の箱 `#6D4C41`(=外周の壁を表す)。
- 下に台座(10.2×0.4×10.2、`#5D4037`)。背景色 `#1F2A36`。

**駒**:
- 〇: 円柱(半径 0.34、高さ 0.22、分割 32)+上面に白いトーラス(半径 0.2、太さ 0.03)で「〇」を表現。
- □: 箱(0.6×0.4×0.6)+上面の輪郭線(EdgesGeometry、白)。
- 材質: `MeshStandardMaterial`、プレイヤー色、roughness 0.5。
- 選択中: y を +0.15、emissive をプレイヤー色で強さ 0.2↔0.5 を 1.2Hz でパルス。
- 動かせる駒: 足元に RingGeometry(内 0.38/外 0.46)をプレイヤー色・不透明度 0.6 で表示。

**プレイヤー色**(色覚多様性に配慮し明度差もつける):

| プレイヤー | 色 | 名称 |
|---|---|---|
| P0 | `#E53935` | 赤 |
| P1 | `#1E88E5` | 青 |
| P2 | `#FDD835` | 黄 |

**壁**:
- 箱: 長さ 1.04 × 高さ 0.5 × 厚さ 0.12。辺の中点に配置(H 辺は X 方向に長い: 中心 `(x-4, 0.25, y-4+0.5)`、V 辺は Z 方向: 中心 `(x-4+0.5, 0.25, y-4)`)。
- 色: 建てたプレイヤー色を黒方向へ 30% 補間した色。中立壁(3)は `#9E9E9E`。
- ゴースト壁: プレイヤー色、`transparent: true`、不透明度 0.35(選択中 0.8)、depthWrite false。

**ハイライト類**: 盤上 y=0.01 の平面(0.9×0.9)。経路プレビューは幅 0.08 の平たい箱を経路の各区間に配置、白、不透明度 0.8。

**領域表示**:
- ゲーム中: 単独所有領域のマスに所有者色の平面(不透明度 0.18)を重ねる(確定支配の可視化)。毎手番更新。
- 結果画面時: 不透明度 0.4 に強める。

**ライティング/レンダラ**:
- `HemisphereLight(0xffffff, 0x444444, 0.6)` + `DirectionalLight(0xffffff, 1.0)` 位置 (5, 12, 7)、影有効(shadow map 1024、盤・駒・壁が影を落とす/受ける)。
- `WebGLRenderer({ antialias: true })`、`setPixelRatio(Math.min(devicePixelRatio, 2))`。
- requestAnimationFrame で常時描画。`visibilitychange` で hidden 時は停止。
- WebGL 非対応時は「この端末は3D表示に対応していません」を表示。

**ピッキング**: `Raycaster` で盤面平面(y=0 の不可視 Plane)との交点を求め、`x = floor(px + 4.5)`, `y = floor(pz + 4.5)` でセルに変換。駒のタップもセル単位で判定する(駒メッシュを直接レイキャストしない。浮いた駒でもセルで当たる方が誤タップが少ないため)。

### 7.6 結果画面(`result-screen`)

- 見出し(`result-winner`):「プレイヤー2の勝利!」/ 引き分け時「引き分け(プレイヤー1・プレイヤー2)」。
- 決着理由の補足: `decidedBy==='efficiency'` のとき「支配マス同数のため、1コマあたり支配マス数で決着」。終了理由 `turnLimit`/`allPassed` のときもその旨を1行表示。
- 順位表(`result-row-{p}`): 順位 / 名前 / 支配マス / 1コマあたり(`bestRegionCells/bestRegionPieces` を小数1桁と分数「30/2」で併記)。
- ボタン: 「もう一度(同じ設定)」`restart-button`、「タイトルへ」`to-title-button`。
- モーダルは「盤面を見る」`result-toggle` で一時的に隠せる(再表示ボタンあり)。

### 7.7 ルール説明(`rules-modal`)

1〜4章の要約を日本語で箇条書き(10〜15行)。〇と□の移動図を簡単な SVG またはテキスト図で表示。

---

## 8. アニメーション仕様

### 8.1 定数(`src/render/animMath.ts` で export)

| 定数 | 値 | 用途 |
|---|---|---|
| `MOVE_DURATION_MS` | **800** | 駒の移動(1マスでも2マスでも全体で 800ms) |
| `WALL_RISE_MS` | 250 | 壁の出現 |
| `WALL_BREAK_MS` | 300 | 壁破り演出 |
| `PLACE_DROP_MS` | 300 | □配置時の落下 |
| `TURN_BANNER_MS` | 900 | 手番バナー(入力ロックしない) |
| `HOP_HEIGHT` | 0.15 | 移動時の跳ね高さ(1マスごと) |

`MOVE_DURATION_MS` は要望の 0.7〜0.9 秒の中央値。単体テストで `700 <= MOVE_DURATION_MS <= 900` を検証する。

### 8.2 移動アニメーション

**決定事項 D-11: 2段移動(〇のL字、□の2マス)でも、移動全体を 800ms で行う(各段 800ms ではない)。** 理由: 1手の待ち時間を一定にしてテンポを揃え、要望の「0.7〜0.9秒」を移動1回あたりの体感時間として満たすため。

- 経路 = `[from, ...path]` の折れ線。総長 L(1 または 2)。
- 時刻 t ∈ [0,1](= 経過ms / 800)に対し、`s = easeInOutCubic(t) * L` の折れ線上の位置に駒を置く(角で止まらず一続きの動き)。
- 高さ: `y = baseY + HOP_HEIGHT * sin(π * frac(s))`(各マス区間で小さく跳ねる。s が整数のとき 0)。
- `easeInOutCubic(t) = t < 0.5 ? 4t³ : 1 - (-2t + 2)³ / 2`。

純粋関数(`animMath.ts`):
```ts
export function easeInOutCubic(t: number): number;
/** points: ワールドXZではなくセル座標の折れ線。t∈[0,1] → {x, y(セル座標系), hop} */
export function samplePath(points: Cell[], t: number): { x: number; y: number; hop: number };
```

### 8.3 壁の出現・壁破り演出

- **壁出現**: 壁確定時、scale.y を 0→1(位置も高さに合わせる)を `WALL_RISE_MS` で `easeOutBack`。
- **壁破り**: 駒の経路上の到達距離 s が「破る辺までの距離 − 0.45」に達した瞬間に開始。`WALL_BREAK_MS` で壁が赤く発光→ scale.y 1→0 で沈み込み、同時に壁色の小立方体 8 個(0.08)が放物線で飛散してフェードアウト。終了後メッシュ破棄。
- 壁破りの開始は移動アニメの途中でも構わない。移動アニメが 800ms で終わっても壁破り演出が残っていれば、その終了まで入力ロックを継続する。

### 8.4 その他

- □配置: y=3 から 0 へ `PLACE_DROP_MS` で easeOutQuad。
- 選択駒の浮上: 120ms(ロック対象外)。
- 結果表示時の領域着色: 不透明度を 400ms でフェードイン(ロック対象外)。

### 8.5 入力ロック

- `Animator` は実行中アニメ(移動・壁出現・壁破り・配置落下)の数を管理し、`isBusy(): boolean` を提供する。
- `controller` はポインタ入力・確定/キャンセルボタンの処理冒頭で `isBusy()` を確認し、true なら無視する(キューイングしない)。確定/キャンセルボタンはロック中 `disabled` にする。
- 処理順: 確定操作 → ロジック関数を呼び新状態とイベントを得る → 内部状態を即座に新状態へ更新 → イベントを順に再生(アニメ)→ すべて終わったらハイライト等を新状態に基づいて表示し、ロック解除。
- テスト用に、各アニメの開始・終了時刻(`performance.now()`)を記録する(10.3 `lastAnimations`)。

---

## 9. スコープ外(AI/オンライン)

**決定事項 D-12: 今回のスコープはローカルホットシート対戦のみ。** オンライン対戦、アカウント、サウンド、多言語化、対局の途中保存、取り消し(Undo)はスコープ外。

- 簡易CPU はオプション(M9)。実装する場合は `src/logic/cpu.ts` に `chooseCpuTurn(state: GameState, rng: () => number): { move: Move; wall: Edge | null }` を純粋関数で作り、方針は「各合法手+壁候補を1手読みし、自分の確定支配マス − 相手の最大確定支配マスが最大の手、同点は rng で選ぶ」。タイトル画面に「CPU」トグルを追加するのはこの時のみ。

---

## 10. テスト計画

### 10.1 単体テスト(Vitest)— 必須ケース

フィクスチャ記法は 12.3 節。`fx(ascii, overrides)` でテスト用 GameState を作る。

**board.test.ts**
1. `edgeBetween({4,4},{4,5})` = `H(4,4)`、`({4,4},{4,3})` = `H(4,3)`、`({4,4},{5,4})` = `V(4,4)`、`({4,4},{3,4})` = `V(3,4)`。
2. `edgesOfCell({0,0})` = `[V(0,0), H(0,0)]`(E, S の順)。`({4,4})` は4本、`({8,4})` は3本(N,S,W)。
3. `neighbor({0,0},'N')` = null。
4. `perpendicular('N')` = `['E','W']`、`perpendicular('S')` = `['E','W']`、`perpendicular('E')` = `['N','S']`。

**setup.test.ts**
1. `createGame({playerCount:2})`: 〇4個が (6,2),(2,6)→P0、(2,2),(6,6)→P1。壁なし。`placementQueue=[0,1,0,1]`、phase `'placement'`、currentPlayer 0。
2. 3人: 〇 P0(2,6), P1(6,2), P2(6,6)、(2,2) は空き。`placementQueue=[0,1,2,0,1,2]`。
3. `legalPlacementCells` 初期2人戦 = 77 セル、3人戦 = 78 セル。
4. `placeSquare` を (6,2) に → `CELL_OCCUPIED`。盤外 → `OUT_OF_BOUNDS`。
5. 4回配置すると phase `'move'`、currentPlayer 0、□の ID が `p0-s0, p1-s0, p0-s1, p1-s1`。
6. 移動フェーズで `placeSquare` → `WRONG_PHASE`。
7. イミュータブル性: 呼出前の state を `structuredClone` して比較し、変化していない。

**moves.test.ts**(駒は fixture で配置、currentPlayer=駒の所有者)
1. 〇 (4,4) 空盤: `legalMovesForPiece` の長さ 12、到着セル集合 = {(4,3),(5,4),(4,5),(3,4),(3,3),(5,3),(5,5),(3,5)}。(4,2) と (4,4) を含まない。
2. 〇 (4,4) 列挙順: 先頭5手が `[N]`, `[N,E]`, `[N,W]`, `[E]`, `[E,N]`。
3. 〇 (0,0): 手は4つ(`[E]`,`[E,S]`,`[S]`,`[S,E]`)、到着 {(1,0),(1,1),(0,1)}。
4. □ (4,4) 空盤: 8手、到着 {(4,3),(4,2),(5,4),(6,4),(4,5),(4,6),(3,4),(2,4)}。
5. □ (0,0): 到着 {(1,0),(2,0),(0,1),(0,2)}。
6. □ (4,4)、(5,4) に他駒: E 方向の手なし((6,4) へ飛び越し不可)。
7. □ (4,4)、(6,4) に他駒: `[E]` のみ可、`[E,E]` 不可。
8. 〇 (4,4)、(4,3) に駒: `[N]`,`[N,E]`,`[N,W]` なし。(3,3) へは `[W,N]`、(5,3) へは `[E,N]` で到達可。
9. 壁: □ (4,4)、`H(4,3)` に壁、壁破り未使用 → `[N]` と `[N,N]` が `breakEdge=H(4,3)` で存在。壁破り使用済み → N 方向の手なし。
10. 二重壁: 〇 (4,4)、壁 `V(4,4)` と `H(5,3)`、壁破り未使用 → `[E,N]` は存在しない(2枚破りになる)、`[N,E]` は `breakEdge=null` で存在、`[E]` は `breakEdge=V(4,4)` で存在。
11. `representativeMoves`(10 の状況): 到着 (5,3) の代表は `[N,E]`(破りなし優先)。
12. `applyMove` 壁破り: 9 の状況で `[N,N]` → 駒 (4,2)、`hWalls[H(4,3)] = -1`、`wallBreakUsed[p]=true`、phase `'wall'`、`pendingWall.cell=(4,2)`、イベント `pieceMoved` の `brokenEdge=H(4,3)`。
13. `applyMove` 不正: 相手の駒 → `NOT_YOUR_PIECE`、存在しない dirs → `ILLEGAL_MOVE`、breakEdge 偽装(壁のない辺を指定)→ `ILLEGAL_MOVE`、phase `'wall'` 中 → `WRONG_PHASE`。
14. 外周: □ (8,4) の E 方向は壁破り未使用でも手なし。

**walls.test.ts**
1. `wallOptions({0,0})` 空盤 = `[V(0,0), H(0,0)]`。`({4,4})` = 4本 N,E,S,W 順 `[H(4,3), V(4,4), H(4,4), V(3,4)]`。
2. 既存壁がある辺は候補から除外。
3. `applyWall` で候補外の辺 → `ILLEGAL_WALL`。成功時 `hWalls`/`vWalls` に currentPlayer の値、`pendingWall=null`、手番が次へ。
4. 移動先セルの4辺がすべて壁 → `applyMove` 直後に `wallSkipped` が出て、phase `'move'` で次プレイヤーの手番。

**regions.test.ts**
1. 空盤: 領域1個、81セル、owners は全プレイヤー。
2. 縦一列の壁 `V(3, y)`(y=0..8): 領域2個、セル数 36 と 45。
3. 12.3 のサンプル盤面 S1: 左下 3×3(x0..2, y6..8)が9セルの領域で owners=[0]、残り 72 セルの領域 owners=[0,1]。`computeScores` → P0 territory 9、P1 0。
4. 駒のいない閉領域(角1マスを `V(0,0)`,`H(0,0)` で囲む)→ owners=[]、誰の territory にも入らない。
5. `isSeparated`: 2 の盤で x≤3 に P0 の駒のみ、x≥4 に P1 の駒のみ → true。P1 の駒を1つ x≤3 に置く → false。
6. `isSettled`: S1 で P0 は false((6,2) などが共有領域にいる)。
7. 3人戦: P0 と P1 が同じ領域、P2 単独領域 → P2 のみ territory を得る。

**scoring.test.ts**(`PlayerScore` を直接作って `rankPlayers` を検証)
1. P0 36 / P1 45 → winners [1]、decidedBy `'territory'`。
2. P0 territory 40(best 30/2=15)、P1 40(best 40/4=10)→ winners [0]、`'efficiency'`。
3. P0 40(best 20/2=10)、P1 40(best 40/4=10)→ winners [0,1]、`'draw'`、両者 rank 1。
4. 3人: territory [40, 40, 1]、efficiency 同値 → ranks [1,1,3]。
5. 3人: territory [30, 20, 30]、P2 の efficiency が上 → ranks P2:1, P0:2, P1:3、`'efficiency'`。
6. `computeScores`: 同じプレイヤーが 30セル(駒2)と 10セル(駒2)の2領域 → territory 40、best 30/2。
7. 誰も領域を持たない → 全員 territory 0、efficiency 0、`'draw'`。

**turn.test.ts**
1. 分断終了: 壁 `V(3,y)` y=0..7 設置済み、P0 の全駒 x≤3、P1 の全駒 x≥4、P0 の駒が (3,8) に移動済みで phase `'wall'`、`pendingWall.cell=(3,8)` → `applyWall(V(3,8))` で phase `'finished'`、reason `'separated'`、territory P0 36 / P1 45、winners [1]、イベント末尾 `gameEnded`。
2. 手数上限: `turnCount=199` の状態で1手番完了 → `'turnLimit'` で終了。
3. 確定スキップ(3人): P0 の全駒が単独領域にあり、P2 が手番を終える → 次は P1(P0 は飛ばされ `playerSkipped(0)` イベント)。
4. パス: P1 の全駒が動けない(四方を壁・駒に囲まれ、壁破り使用済み)状態で P0 が手番を終える → `turnPassed(1)`、次は P0。`turnCount` は 2 増える。
5. 全員パス: 未確定プレイヤー全員が動けない → `'allPassed'` で終了。
6. 通常手番後: `turnCount` +1、`consecutivePasses=0`、currentPlayer が次へ、`turnStarted` イベント。
7. `log` に place/move/wall/pass/skip が順に記録される。

**animMath.test.ts**
1. `700 <= MOVE_DURATION_MS && MOVE_DURATION_MS <= 900`。
2. `easeInOutCubic(0)=0`, `(1)=1`, `(0.5)=0.5`、単調増加(0..1 を 100 分割で確認)。
3. `samplePath([(4,4),(5,4)], 0.5)` → (4.5, 4)、hop = HOP_HEIGHT。
4. `samplePath([(4,4),(5,4),(5,3)], 0.5)` → (5,4)(角)、hop ≈ 0。t=1 → (5,3)、t=0 → (4,4)。
5. t<0 / t>1 は [0,1] にクランプ。

**purity.test.ts**
- `src/logic/**/*.ts` の本文を読み、`from 'three'`、`document`、`window`、`Math.random`、`Date.now`、`localStorage` を含まないこと。

**serialize**
- `deserialize(serialize(s))` が `s` と deep equal。不正 JSON(配列長不一致など)で例外。

カバレッジ目標: `src/logic` の行カバレッジ 90% 以上(`vitest run --coverage` は任意)。

### 10.2 E2E(Playwright)動作確認項目

前提: URL に `?test=1` を付けて起動し、`window.__HANG__`(10.3)を使う。キャンバス上のクリックは `__HANG__.cellToScreen(x,y)` で得たページ座標を `page.mouse.click`(モバイルは `page.touchscreen.tap`)。

| # | ファイル | 内容 | 合格条件 |
|---|---|---|---|
| E1 | title.spec | タイトル表示、2人/3人切替、ルールモーダル開閉 | testid が表示される。コンソールエラー 0 |
| E2 | placement.spec | 2人で開始 → □を4個配置(各セル2回タップ) | `getState().phase==='move'`、□4個が指定セル |
| E3 | move.spec | P0 の〇を選択 | `getHighlights().cells` が `representativeMoves` の到着セルと一致 |
| E4 | move.spec | 移動確定 → アニメ時間計測 | `lastAnimations()` の move の `endedAt-startedAt` が 700〜900ms(フレーム誤差で ±40ms 許容) |
| E5 | move.spec | アニメ中に別セルをクリック | 状態・選択が変化しない、確定ボタン disabled |
| E6 | move.spec | 壁候補をタップして確定 | 壁が1本増え(hWalls/vWalls に P0 の値)、currentPlayer=1、`hud-current-player` がプレイヤー2 |
| E7 | wallbreak.spec | `loadState(fixtures/wallbreak.json)` → オレンジハイライト → 確定 | 壁が消える、`hud-break-0` が「壁破り 0」、壁破り演出の記録あり |
| E8 | end.spec | `loadState(fixtures/near-end.json)`(turn.test 1 相当)→ 最後の壁 | `result-screen` 表示、`result-winner` に「プレイヤー2の勝利」 |
| E9 | end.spec | 「もう一度」→ 配置フェーズの初期状態、「タイトルへ」→ タイトル | |
| E10 | three.spec | 3人で開始 | 〇3個が (2,6),(6,2),(6,6)、HUD にスコア行3つ |
| E11 | layout.spec | 360×640, 390×844, 844×390, 1280×720, 1920×1080 | `getBoardCorners()` の4点がキャンバス内(余白8px以上)、HUD とキャンバスの bounding box が重ならない、`document.documentElement.scrollWidth <= innerWidth` |
| E12 | visual.spec | 各状態のスクリーンショット保存(初期・選択中・壁フェーズ・結果) | 保存のみ(目視確認用、比較はしない) |
| E13 | 全体 | `page.on('console')` で error 出力を収集 | 0 件 |

### 10.3 テストフック `window.__HANG__`

`?test=1` のとき、または `import.meta.env.DEV` のときのみ公開する(本番ビルドでも `?test=1` で有効化可能にする。秘匿情報は扱わないため問題なし)。

```ts
interface HangTestHooks {
  getState(): GameState;                         // deep clone
  loadState(json: string | GameState): void;     // 盤面を再構築、ゲーム画面へ遷移
  cellToScreen(x: number, y: number): { x: number; y: number }; // ページ座標(CSS px)
  edgeToScreen(e: Edge): { x: number; y: number };
  getHighlights(): { cells: Cell[]; breakCells: Cell[]; edges: Edge[] };
  getSelection(): { pieceId: string | null; target: Cell | null; edge: Edge | null };
  isBusy(): boolean;
  lastAnimations(): { kind: 'move' | 'wallRise' | 'wallBreak' | 'drop'; startedAt: number; endedAt: number | null }[]; // 直近20件
  getBoardCorners(): { x: number; y: number }[]; // 盤外周4隅(y=0 平面)の投影ページ座標
}
```

### 10.4 手動確認(実機、コンテナ外)

- Windows: Electron 版でウィンドウリサイズ・マウス操作。
- Android/iOS 実機: タップ精度、縦横回転時の再レイアウト、ノッチのセーフエリア、60fps 近くで動くこと。

---

## 11. 実装タスク チェックリスト(マイルストーン)

各マイルストーン完了時に `npm test`(と該当する E2E)が通ること。コミットはマイルストーン単位を推奨。

### M0 プロジェクト雛形
- [ ] `game/` に Vite + TS(vanilla-ts テンプレート相当)を作成、`tsconfig` strict
- [ ] three, vitest, @playwright/test 導入、2.4 の npm scripts を定義
- [ ] `vite.config.ts`(`base:'./'`、vitest 設定)、`playwright.config.ts`(2.4 の projects と launchOptions)
- [ ] 空の Three.js シーン(盤の板1枚)が表示されることを確認
- [ ] `.gitignore`(node_modules, dist, test-results, playwright-report, android, ios は生成時に判断)

### M1 ロジック基盤
- [ ] `types.ts`, `constants.ts`, `board.ts`
- [ ] `tests/helpers/boardFixture.ts`(12.3)
- [ ] `setup.ts`(createGame / legalPlacementCells / placeSquare)
- [ ] board.test / setup.test / purity.test 通過

### M2 移動・壁
- [ ] `moves.ts`(6.3 の擬似コード、representativeMoves、applyMove)
- [ ] `walls.ts`(wallOptions, applyWall)
- [ ] moves.test / walls.test 通過

### M3 領域・スコア・手番進行
- [ ] `regions.ts`, `scoring.ts`, `turn.ts`, `serialize.ts`
- [ ] regions / scoring / turn / serialize のテスト通過
- [ ] ロジック全体でコンソール用の簡易スクリプト(任意)で1局をランダムに最後まで進められること(無限ループしない)— 乱数はテスト側で用意

### M4 静的3D描画
- [ ] scene / camera(フィット計算)/ boardView / pieceView / wallView
- [ ] GameState を渡すと盤・駒・壁・領域着色が描画される(アニメなし)
- [ ] リサイズ対応、縦横レイアウト(HUD 仮置き)

### M5 入力と UI 状態機械
- [ ] picking(セル変換、最寄り辺選択)
- [ ] controller: 配置 → 駒選択 → 移動先 → 確定 → 壁選択 → 確定 の一連(アニメなしで即反映)
- [ ] highlightView(通常/壁破りの2色、経路プレビュー、ゴースト壁)
- [ ] testHooks.ts(10.3)

### M6 アニメーション
- [ ] animMath.ts + animMath.test
- [ ] animator(移動 800ms、壁出現、壁破り、配置落下、isBusy、記録)
- [ ] 入力ロック(8.5)

### M7 画面・HUD
- [ ] タイトル画面(人数・名前・設定保存)、ルールモーダル
- [ ] HUD(7.3 の全項目)、手番バナー
- [ ] 結果画面(7.6)、もう一度/タイトルへ
- [ ] レスポンシブ最終調整、セーフエリア

### M8 E2E
- [ ] fixtures(wallbreak.json, near-end.json)を `serialize` で作成
- [ ] E1〜E13 を実装し全プロジェクト(desktop / mobile-portrait / mobile-landscape)で通過
- [ ] スクリーンショットを目視確認

### M9 パッケージング
- [ ] vite-plugin-pwa(manifest: name, short_name, icons, display `standalone`, orientation `any`, theme_color `#1F2A36`)、オフライン動作
- [ ] `electron/main.cjs`(BrowserWindow 1280×800、`loadFile('dist/index.html')`、メニューバー非表示)、electron-builder 設定(`build.win.target = nsis`)
- [ ] `capacitor.config.ts`、`npx cap add android` / `ios`(各OS環境で)、`npm run cap:sync`
- [ ] README(`game/README.md`)に起動・ビルド手順を記載

### M10(オプション)
- [ ] 簡易CPU(9章)
- [ ] 効果音、対局の自動保存

---

## 12. 付録

### 12.1 決定事項一覧

| ID | 内容 | 章 |
|---|---|---|
| D-01 | TS + Three.js + Vite、PWA / Electron(Win) / Capacitor(iOS, Android) | 2.1 |
| D-02 | アプリは `game/` 配下に置く | 2.2 |
| D-03 | 親=P0、手番は P0→P1→P2 の固定順 | 4.1 |
| D-04 | 移動後に移動先マスの辺へ壁を1枚建てる(Wall Go 準拠) | 4.4 |
| D-05 | 2人: 〇2+□2/人、3人: 〇1+□2/人、〇は (2,2)(6,2)(2,6)(6,6) から割当 | 4.2 |
| D-06 | 壁破りは移動の一部としてのみ、1移動で1枚、外周不可 | 4.6 |
| D-07 | 単独所有の閉領域のみ支配マス。共存・無人領域は無効 | 4.7 |
| D-08 | 全駒が自分単独の領域にいるプレイヤーは手番スキップ | 4.8 |
| D-09 | 終了: 全員分断 / 総手数200 / 全員連続パス | 4.9 |
| D-10 | 同点時は「領域ごとの 1コマあたりマス数」の最大値、なお同値なら引き分け | 4.10 |
| D-11 | 移動アニメは1手全体で 800ms(2段でも分割しない)、easeInOutCubic | 8.2 |
| D-12 | ローカルホットシートのみ。CPU はオプション | 9 |

### 12.2 定数一覧(`src/logic/constants.ts` と `src/render/animMath.ts`)

| 定数 | 値 |
|---|---|
| `BOARD_SIZE` | 9 |
| `CIRCLE_START` | 4.2 の表 |
| `SQUARES_PER_PLAYER` | 2 |
| `MAX_TURNS` | 200 |
| `PLAYER_COLORS` | `['#E53935', '#1E88E5', '#FDD835']` |
| `MOVE_DURATION_MS` | 800 |
| `WALL_RISE_MS` | 250 |
| `WALL_BREAK_MS` | 300 |
| `PLACE_DROP_MS` | 300 |
| `TURN_BANNER_MS` | 900 |
| `HOP_HEIGHT` | 0.15 |

### 12.3 ASCII 盤面フォーマット(テストフィクスチャ兼、本書の図)

19 行 × 19 文字。行 `2y+1` がセル行 y、行 `2y+2` が「セル行 y と y+1 の間」の横辺行(y=0..7)、行 0 と行 18 は外周。

- セル行 y: 文字位置 `2x+1` = セル (x,y) の内容、位置 `2x+2`(x=0..7)= 縦辺 `V(x,y)`(`|` なら壁、空白なら壁なし)。位置 0 と 18 は外周 `|`。
- 横辺行: 位置 `2x+1` = 横辺 `H(x,y)`(`-` なら壁)。偶数位置は `+`。
- セル内容: `.` 空き、`A`/`a` = P0 の 〇/□、`B`/`b` = P1、`C`/`c` = P2。
- フィクスチャから作る壁の値は `NEUTRAL_WALL (3)`。

ヘルパー:
```ts
// tests/helpers/boardFixture.ts
export function fx(ascii: string, overrides?: Partial<GameState> & { playerCount?: PlayerCount }): GameState;
// - ascii は前後の空行・各行の前後空白を trim してから 19×19 を検証(不一致なら例外)
// - 駒 ID はプレイヤーごと・種類ごとに、セル idx 昇順で 0 から採番
// - 既定: playerCount = 出現する最大プレイヤー+1(最低2), phase 'move', currentPlayer 0,
//         wallBreakUsed 全 false, placementQueue [], pendingWall null, turnCount 0
export function toAscii(s: GameState): string;   // 逆変換(デバッグ・失敗時表示用)
```

**図1: 2人戦 初期盤面(□配置前)**

```
     0 1 2 3 4 5 6 7 8
    +-+-+-+-+-+-+-+-+-+
y0  |. . . . . . . . .|
    + + + + + + + + + +
y1  |. . . . . . . . .|
    + + + + + + + + + +
y2  |. . B . . . A . .|
    + + + + + + + + + +
y3  |. . . . . . . . .|
    + + + + + + + + + +
y4  |. . . . . . . . .|
    + + + + + + + + + +
y5  |. . . . . . . . .|
    + + + + + + + + + +
y6  |. . A . . . B . .|
    + + + + + + + + + +
y7  |. . . . . . . . .|
    + + + + + + + + + +
y8  |. . . . . . . . .|
    +-+-+-+-+-+-+-+-+-+
```

**図2: 3人戦 初期盤面(□配置前)** — (2,2) は空き

```
     0 1 2 3 4 5 6 7 8
    +-+-+-+-+-+-+-+-+-+
y0  |. . . . . . . . .|
    + + + + + + + + + +
y1  |. . . . . . . . .|
    + + + + + + + + + +
y2  |. . . . . . B . .|
    + + + + + + + + + +
y3  |. . . . . . . . .|
    + + + + + + + + + +
y4  |. . . . . . . . .|
    + + + + + + + + + +
y5  |. . . . . . . . .|
    + + + + + + + + + +
y6  |. . A . . . C . .|
    + + + + + + + + + +
y7  |. . . . . . . . .|
    + + + + + + + + + +
y8  |. . . . . . . . .|
    +-+-+-+-+-+-+-+-+-+
```

**図3: サンプル盤面 S1(2人戦・中盤)**

```
     0 1 2 3 4 5 6 7 8
    +-+-+-+-+-+-+-+-+-+
y0  |. . . . . . . . .|
    + + + + + + + + + +
y1  |. b . . . . . . .|
    + + + + + + + + + +
y2  |. . B . . . A . .|
    + + + + +-+ + + + +
y3  |. . . . . . . . .|
    + + + + + + + + + +
y4  |. . . . . . a . .|
    + + + + + + + + + +
y5  |. . . . . . . . .|
    +-+-+-+ + + + + + +
y6  |. . A|. . . B . .|
    + + + + + + + + + +
y7  |. . .|. b . . . .|
    + + + + + + + + + +
y8  |a . .|. . . . . .|
    +-+-+-+-+-+-+-+-+-+
```

- 壁: `H(4,2)`(=(4,2) と (4,3) の間)、`H(0,5)`,`H(1,5)`,`H(2,5)`、`V(2,6)`,`V(2,7)`,`V(2,8)`。
- 領域: 左下 3×3 の9セル(owners [0]: A(2,6), a(0,8))と、残り72セル(owners [0,1])。H(4,2) は単独では何も囲わない。
- スコア: P0 territory 9(efficiency 9/2)、P1 0。P0 は (6,2),(6,4) が共有領域にいるため未確定。
- 例: P0 の 〇 (6,2) の合法手に (6,1)、(7,2)、(5,1) など。P0 の □ (6,4) は N へ (6,3) まで((6,2) に自駒があるため2マス目不可)。

**図4: 分断終了直前(turn.test 1 / E2E near-end)**

```
     0 1 2 3 4 5 6 7 8
    +-+-+-+-+-+-+-+-+-+
y0  |. . . .|. . . . .|
    + + + + + + + + + +
y1  |. . . .|. . . . .|
    + + + + + + + + + +
y2  |. . . .|. . B . .|
    + + + + + + + + + +
y3  |. a . .|. . . b .|
    + + + + + + + + + +
y4  |. . . .|. . . . .|
    + + + + + + + + + +
y5  |. . . .|. b . . .|
    + + + + + + + + + +
y6  |. . A .|. . B . .|
    + + + + + + + + + +
y7  |. . . .|. . . . .|
    + + + + + + + + + +
y8  |. a . A . . . . .|
    +-+-+-+-+-+-+-+-+-+
```

- overrides: `phase:'wall'`, `currentPlayer:0`, `pendingWall:{ pieceId: <(3,8)の〇のID>, cell:{x:3,y:8} }`。
- `applyWall(V(3,8))` → 左36セル(P0のみ)/右45セル(P1のみ)に分断 → `'separated'` で終了、P1 の勝利(45 対 36)。
