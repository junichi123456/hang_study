import { expect, test } from '@playwright/test';
import { open, placeAll, start, state, tapCell, tapEdge, waitIdle } from './helpers';
import { readFileSync } from 'node:fs';

const tap = async (page: any, x: number, y: number) => { await tapCell(page, x, y); };

test('E1 タイトル/人数切替/ルール', async ({ page }) => {
  const errors = await open(page);
  await page.getByTestId('player-count-3').click();
  await expect(page.getByTestId('name-input-2')).toBeVisible();
  await page.getByTestId('player-count-2').click();
  await expect(page.getByTestId('name-input-2')).toBeHidden();
  await page.getByTestId('rules-button').click();
  await expect(page.getByTestId('rules-modal')).toBeVisible();
  await page.getByTestId('rules-close').click();
  await expect(page.getByTestId('rules-modal')).toBeHidden();
  expect(errors).toEqual([]);
});

test('E2-E6 配置→移動→壁、アニメ時間と入力ロック', async ({ page }) => {
  test.setTimeout(120000); // ソフトウェア描画(SwiftShader)では低fpsのため長めに取る
  const errors = await open(page);
  await start(page, 2);
  await page.screenshot({ path: 'test-results/shot-initial.png' });
  await placeAll(page, [[0, 0], [8, 0], [0, 8], [8, 8]]);
  let s = await state(page);
  expect(s.phase).toBe('move');
  expect(s.pieces.filter((p: any) => p.kind === 'square').map((p: any) => [p.pos.x, p.pos.y])).toEqual([[0, 0], [8, 0], [0, 8], [8, 8]]);
  // E3: 〇(6,2) を選択
  await tap(page, 6, 2);
  const hl = await page.evaluate(() => (window as any).__HANG__.getHighlights());
  expect(hl.cells.length + hl.breakCells.length).toBe(8);
  await page.screenshot({ path: 'test-results/shot-selected.png' });
  // 移動先 (6,1)
  await tap(page, 6, 1);
  await expect(page.getByTestId('confirm-button')).toBeEnabled();
  await page.getByTestId('confirm-button').click();
  // E5: アニメ中の入力無視
  await page.waitForFunction(() => (window as any).__HANG__.isBusy());
  await expect(page.getByTestId('confirm-button')).toBeDisabled();
  await tap(page, 3, 3);
  await waitIdle(page);
  const anims = await page.evaluate(() => (window as any).__HANG__.lastAnimations());
  const mv = anims.filter((a: any) => a.kind === 'move').at(-1);
  const dur = mv.endedAt - mv.startedAt;
  // 終了はフレーム単位で記録されるため、低fpsのCI描画では最大1フレーム(~150ms)の誤差を許容
  expect(dur).toBeGreaterThanOrEqual(660); expect(dur).toBeLessThanOrEqual(1050);
  s = await state(page);
  expect(s.phase).toBe('wall');
  await page.screenshot({ path: 'test-results/shot-wall.png' });
  // E6: 壁
  await tapEdge(page, { o: 'H', x: 6, y: 0 });
  await page.getByTestId('confirm-button').click();
  await waitIdle(page);
  s = await state(page);
  expect([...s.hWalls, ...s.vWalls].filter((v: number) => v === 0)).toHaveLength(1);
  expect(s.currentPlayer).toBe(1);
  await expect(page.getByTestId('hud-current-player')).toContainText('プレイヤー2');
  expect(errors).toEqual([]);
});

test('E7 壁破り', async ({ page }) => {
  const errors = await open(page);
  await start(page, 2);
  const fixture = JSON.parse(readFileSync('tests/e2e/fixtures/wallbreak.json', 'utf8'));
  await page.evaluate((f) => (window as any).__HANG__.loadState(f), fixture);
  await page.waitForFunction(() => !!(window as any).__HANG__);
  await tap(page, 4, 4);
  const hl = await page.evaluate(() => (window as any).__HANG__.getHighlights());
  expect(hl.breakCells.length).toBeGreaterThan(0);
  await tap(page, 4, 3);
  await expect(page.getByTestId('confirm-button')).toContainText('壁破り');
  await page.getByTestId('confirm-button').click();
  await waitIdle(page);
  const s = await state(page);
  expect(s.hWalls[3 * 9 + 4]).toBe(-1);
  await expect(page.getByTestId('hud-break-0')).toContainText('壁破り 0');
  const anims = await page.evaluate(() => (window as any).__HANG__.lastAnimations());
  expect(anims.some((a: any) => a.kind === 'wallBreak')).toBe(true);
  expect(errors).toEqual([]);
});

test('E8-E9 終了→結果→もう一度/タイトル', async ({ page }) => {
  await open(page);
  await start(page, 2);
  const fixture = JSON.parse(readFileSync('tests/e2e/fixtures/near-end.json', 'utf8'));
  await page.evaluate((f) => (window as any).__HANG__.loadState(f), fixture);
  await page.waitForFunction(() => !!(window as any).__HANG__);
  await tapEdge(page, { o: 'V', x: 3, y: 8 });
  await page.getByTestId('confirm-button').click();
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('result-winner')).toContainText('プレイヤー2の勝利');
  await page.screenshot({ path: 'test-results/shot-result.png' });
  await page.getByTestId('restart-button').click();
  await expect(page.getByTestId('hud-phase')).toContainText('□を置くマス');
  expect((await state(page)).phase).toBe('placement');
  await page.getByTestId('menu-button').click();
  await page.getByTestId('quit-yes').click();
  await expect(page.getByTestId('title-screen')).toBeVisible();
});

test('E10 3人戦', async ({ page }) => {
  await open(page);
  await start(page, 3);
  const s = await state(page);
  expect(s.pieces.map((p: any) => [p.pos.x, p.pos.y])).toEqual([[2, 6], [6, 2], [6, 6]]);
  for (const p of [0, 1, 2]) await expect(page.getByTestId(`hud-score-${p}`)).toBeVisible();
});

test('E11 レイアウト', async ({ page }) => {
  await open(page);
  await start(page, 2);
  for (const [w, h] of [[360, 640], [390, 844], [844, 390], [1280, 720], [1920, 1080]]) {
    await page.setViewportSize({ width: w!, height: h! });
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const hk = (window as any).__HANG__;
      const cv = document.querySelector('[data-testid="game-canvas"]')!.getBoundingClientRect();
      const hud = document.querySelector('[data-testid="hud"]')!.getBoundingClientRect();
      return { corners: hk.getBoardCorners(), cv: cv.toJSON(), hud: hud.toJSON(), sw: document.documentElement.scrollWidth, iw: innerWidth };
    });
    for (const c of r.corners) {
      expect(c.x).toBeGreaterThanOrEqual(r.cv.left + 8); expect(c.x).toBeLessThanOrEqual(r.cv.right - 8);
      expect(c.y).toBeGreaterThanOrEqual(r.cv.top + 8); expect(c.y).toBeLessThanOrEqual(r.cv.bottom - 8);
    }
    const overlap = r.hud.left < r.cv.right - 1 && r.hud.right > r.cv.left + 1 && r.hud.top < r.cv.bottom - 1 && r.hud.bottom > r.cv.top + 1;
    expect(overlap, `${w}x${h}`).toBe(false);
    expect(r.sw).toBeLessThanOrEqual(r.iw);
    await page.screenshot({ path: `test-results/shot-layout-${w}x${h}.png` });
  }
});
