import { expect, test } from '@playwright/test';
import { KIDS, childId, loginAsDemo, parentApi, playAs, typePin } from './helpers';

test.describe('Parcours enfant', () => {
  test('mauvais PIN puis bon PIN', async ({ page }) => {
    await loginAsDemo(page);
    await page.getByRole('button', { name: /Emilia/ }).click();
    await typePin(page, '0000');
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
      'Ce n’est pas le bon code',
    );
    await typePin(page, KIDS.emilia.pin);
    await expect(page.getByRole('heading', { name: /Bonjour Emilia/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Braise' })).toBeVisible();
  });

  test('mission validée en temps réel → XP, éclosion de l’oeuf', async ({ page, baseURL }) => {
    const parent = await parentApi(baseURL ?? 'http://localhost:3000');
    const judeId = await childId(parent, KIDS.jude.name);
    const mission = await (
      await parent.post('/api/missions', {
        data: {
          title: 'Mission E2E',
          category: 'HELPING',
          icon: '🧪',
          xp: 45,
          coins: 5,
          recurrence: 'ONCE',
          assignedChildId: judeId,
        },
      })
    ).json();

    await loginAsDemo(page);
    await playAs(page, KIDS.jude);
    await expect(page.getByText('Oeuf', { exact: true })).toBeVisible();

    await page
      .getByRole('link', { name: /Missions/ })
      .first()
      .click();
    const card = page.locator('li', { hasText: 'Mission E2E' });
    await card.getByRole('button', { name: 'C’est fait !' }).click();
    await expect(card.getByText('En attente de validation')).toBeVisible();

    // Le parent valide depuis un autre appareil.
    const pending = (await (await parent.get('/api/missions/pending')).json()) as Array<{
      id: string;
      mission: { id: string };
    }>;
    const completion = pending.find((p) => p.mission.id === mission.id);
    expect(completion).toBeTruthy();
    await parent.post(`/api/missions/completions/${completion?.id}/approve`);

    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByText('Mission validée !')).toBeVisible();
    await expect(dialog.getByText('Papa vient de valider « Mission E2E »')).toBeVisible();
    await expect(dialog.getByText('+45 XP')).toBeVisible();
    await dialog.getByRole('button', { name: 'Super !' }).click();
    await expect(page.getByRole('alertdialog').getByText('Niveau 2 !')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Super !' }).click();
    await expect(page.getByRole('alertdialog').getByText('L’oeuf a éclos !')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Super !' }).click();
  });

  test('exploration : départ puis retour avec trouvailles', async ({ page }) => {
    await loginAsDemo(page);
    await playAs(page, KIDS.haylie);
    await page
      .getByRole('link', { name: /Explorer/ })
      .first()
      .click();
    await page
      .getByRole('button', { name: /Partir/ })
      .first()
      .click();
    await expect(page.getByText(/Luna explore Forêt lumineuse/)).toBeVisible();
    // EXPLORATION_TIME_SCALE accélère la durée en développement.
    await expect(page.getByRole('alertdialog').getByText('Luna est revenu !')).toBeVisible({
      timeout: 75_000,
    });
    await expect(page.getByRole('alertdialog').getByText('+15 XP')).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Super !' }).click();
  });

  test('cuisine : une recette secrète est découverte', async ({ page }) => {
    await loginAsDemo(page);
    await playAs(page, KIDS.haylie);
    await page.goto('/play/kitchen');
    await page.getByRole('tab', { name: /Cuisiner/ }).click();
    await page
      .getByRole('button', { name: /^Raisins|^Fraise/ })
      .first()
      .click();
    await page.getByRole('button', { name: /^Lait/ }).click();
    await page.getByRole('button', { name: /Cuisiner !/ }).click();
    await expect(
      page.getByRole('status').filter({ hasText: /Tu as préparé|ce mélange/ }),
    ).toBeVisible();
  });

  test('ouvrir un cadeau du parent', async ({ page }) => {
    await loginAsDemo(page);
    await playAs(page, KIDS.haylie);
    await page.goto('/play/gifts');
    await page.getByRole('button', { name: /De la part de Papa/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Ouvrir' }).click();
    await expect(
      page.getByRole('dialog').getByText('« Bravo pour ta semaine de lecture ! »'),
    ).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Super !' }).click();
  });

  test("un enfant ne peut pas ouvrir l'espace parent", async ({ page }) => {
    await loginAsDemo(page);
    await playAs(page, KIDS.emilia);
    const res = await page.request.get('/api/parent/dashboard');
    expect(res.status()).toBe(403);
    await page.goto('/parent');
    await expect(page.getByText('Qui joue ?')).toBeVisible();
  });
});
