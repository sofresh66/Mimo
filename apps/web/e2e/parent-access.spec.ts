import { expect, test, type Page } from '@playwright/test';
import { DEMO, KIDS, loginAsDemo, openParentSpace, playAs, typePin } from './helpers';

/**
 * L'espace parent exige TOUJOURS le PIN parent, y compris juste après la connexion
 * (nouvel appareil, reconnexion). Le serveur est l'autorité : les API parent répondent 403.
 */
const pinDialog = (page: Page) => page.getByRole('dialog').filter({ hasText: 'Code PIN parent' });

test.describe('Accès à l’espace parent', () => {
  test('nouvel appareil : PIN exigé, mauvais PIN refusé, bon PIN accepté, persistant au rechargement', async ({
    page,
  }) => {
    await loginAsDemo(page);
    expect((await page.request.get('/api/parent/dashboard')).status()).toBe(403);

    await page.getByRole('button', { name: /Espace parent/ }).click();
    await expect(pinDialog(page)).toBeVisible();
    await expect(page).not.toHaveURL(/\/parent/);

    await typePin(page, '0000');
    await expect(pinDialog(page).getByRole('alert')).toBeVisible();
    await expect(page).not.toHaveURL(/\/parent/);

    await typePin(page, DEMO.parentPin);
    await expect(page).toHaveURL(/\/parent$/);
    await expect(page.getByRole('button', { name: /Verrouiller/ })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/parent$/);
    await expect(page.getByRole('button', { name: /Verrouiller/ })).toBeVisible();
  });

  test('URL parent saisie directement : retour à « Qui joue ? » avec le PIN demandé', async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.goto('/parent/settings');
    await expect(page).toHaveURL(/\/$/);
    await expect(pinDialog(page)).toBeVisible();
    expect((await page.request.get('/api/family')).status()).toBe(403);
    expect((await page.request.get('/api/missions')).status()).toBe(403);
  });

  test('enfant : ni URL ni API parent, même en connaissant le chemin', async ({ page }) => {
    await loginAsDemo(page);
    await playAs(page, KIDS.emilia);
    await page.goto('/parent');
    await expect(page).not.toHaveURL(/\/parent/);
    await expect(pinDialog(page)).toBeVisible();
    for (const path of ['/api/parent/dashboard', '/api/family', '/api/family/invitations']) {
      expect((await page.request.get(path)).status()).toBe(403);
    }
    expect(
      (
        await page.request.post('/api/rewards', {
          data: { childId: 'x', type: 'COINS', amount: 9 },
        })
      ).status(),
    ).toBe(403);
  });

  test('« Verrouiller » puis déconnexion/reconnexion : le PIN est de nouveau exigé', async ({
    page,
  }) => {
    await loginAsDemo(page);
    await openParentSpace(page);
    await page.getByRole('button', { name: /Verrouiller/ }).click();
    await expect(page.getByText('Qui joue ?')).toBeVisible();
    await page.getByRole('button', { name: /Espace parent/ }).click();
    await expect(pinDialog(page)).toBeVisible();
    await typePin(page, DEMO.parentPin);
    await expect(page).toHaveURL(/\/parent/);

    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/\/login/);
    await loginAsDemo(page);
    expect((await page.request.get('/api/parent/dashboard')).status()).toBe(403);
    await page.getByRole('button', { name: /Espace parent/ }).click();
    await expect(pinDialog(page)).toBeVisible();
  });
});
