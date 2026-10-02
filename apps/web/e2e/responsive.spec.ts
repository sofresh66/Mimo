import { expect, test, type Page } from '@playwright/test';
import { KIDS, loginAsDemo, playAs } from './helpers';

const WIDTHS = [375, 390, 430, 768, 1024, 1440];

async function assertNoHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `défilement horizontal sur ${label}`).toBeLessThanOrEqual(1);
}

test('aucun défilement horizontal sur les écrans principaux (375 → 1440 px)', async ({ page }) => {
  await loginAsDemo(page);
  await playAs(page, KIDS.emilia);
  const childPages = [
    '/play',
    '/play/missions',
    '/play/explore',
    '/play/inventory',
    '/play/kitchen',
    '/play/collection',
    '/play/village',
    '/play/games',
  ];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of childPages) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await assertNoHorizontalScroll(page, `${path} @${width}px`);
    }
  }
});

test('les boutons principaux sont assez grands pour le doigt', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loginAsDemo(page);
  await playAs(page, KIDS.haylie);
  for (const name of ['Nourrir', 'Explorer', 'Missions']) {
    const box = await page.getByRole('link', { name }).first().boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
