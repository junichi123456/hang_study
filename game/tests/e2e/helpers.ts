import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?test=1');
  await expect(page.getByTestId('title-screen')).toBeVisible();
  return errors;
}
export async function start(page: Page, n: 2 | 3 = 2): Promise<void> {
  await page.getByTestId(`player-count-${n}`).click();
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__HANG__);
}

export async function tapCell(page: Page, x: number, y: number): Promise<void> {
  const p = await page.evaluate(([cx, cy]) => (window as any).__HANG__.cellToScreen(cx!, cy!), [x, y]);
  await page.mouse.click(p.x, p.y);
}
export async function tapEdge(page: Page, e: { o: string; x: number; y: number }): Promise<void> {
  const p = await page.evaluate((ed) => (window as any).__HANG__.edgeToScreen(ed), e);
  await page.mouse.click(p.x, p.y);
}
export async function waitIdle(page: Page): Promise<void> {
  await page.waitForFunction(() => !(window as any).__HANG__.isBusy());
}
export async function state(page: Page): Promise<any> { return page.evaluate(() => (window as any).__HANG__.getState()); }
export async function placeAll(page: Page, cells: [number, number][]): Promise<void> {
  for (const [x, y] of cells) {
    await tapCell(page, x, y);
    await page.getByTestId('confirm-button').click();
    await waitIdle(page);
  }
}
