import { expect, test } from '@playwright/test';
import { KIDS, childId, loginAsDemo, parentApi, typePin } from './helpers';

test.describe('Parcours parent', () => {
  test('inscription → famille → enfant → mission → validation', async ({ page }) => {
    const email = `e2e-${Date.now()}@test.local`;
    await page.goto('/register');
    await page.getByLabel('Comment les enfants vous appellent-ils ?').fill('Maman');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe').fill('un-mot-de-passe-solide');
    await page.getByRole('button', { name: 'Créer mon compte' }).click();

    await expect(page.getByRole('heading', { name: 'Créons votre famille' })).toBeVisible();
    await page.getByLabel('Nom de la famille').fill('Les Testeurs');
    await page.getByLabel('Code PIN parent (4 chiffres)').fill('2468');
    await page.getByRole('button', { name: 'Créer ma famille' }).click();

    await expect(
      page.getByRole('heading', { name: 'Ajoutez les profils de vos enfants' }),
    ).toBeVisible();
    await page.getByLabel('Prénom ou pseudo').fill('Zoé');
    await page.getByRole('radio', { name: '🐱' }).click();
    await page.getByLabel('Code secret (4 chiffres)').fill('1357');
    await page.getByRole('button', { name: 'Ajouter un enfant' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: 'Zoé' })).toBeVisible();
    await page.getByRole('button', { name: 'C’est parti !' }).click();

    await expect(page.getByText('Qui joue ?')).toBeVisible();
    await page.getByRole('button', { name: /Espace parent/ }).click();
    await expect(page).toHaveURL(/\/parent/);

    // Mission depuis un modèle.
    await page.getByRole('link', { name: /Missions/ }).click();
    await page.getByRole('button', { name: '+ Nouvelle mission' }).click();
    await page.getByRole('button', { name: /Lire 15 minutes/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText('Mission créée')).toBeVisible();

    // Validation directe pour l'enfant.
    await page
      .locator('li', { hasText: 'Lire 15 minutes' })
      .getByRole('button', { name: /Valider pour/ })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /Valider/ })
      .click();
    await expect(page.getByText('Mission validée pour Zoé !')).toBeVisible();

    // Verrouillage de l'espace parent puis PIN parent.
    await page.getByRole('button', { name: /Verrouiller/ }).click();
    await expect(page.getByText('Qui joue ?')).toBeVisible();
    await page.getByRole('button', { name: /Espace parent/ }).click();
    await typePin(page, '2468');
    await expect(page).toHaveURL(/\/parent/);
    expect(email).toContain('@');
  });

  test('tableau de bord : validation d’une demande en attente', async ({ page, baseURL }) => {
    // Une demande « C'est fait ! » envoyée par Emilia depuis un autre appareil.
    const device = await parentApi(baseURL ?? 'http://localhost:3000');
    await device.post('/api/auth/unlock/child', {
      data: { childId: await childId(device, KIDS.emilia.name), pin: KIDS.emilia.pin },
    });
    const missions = (await (await device.get('/api/me/missions')).json()) as Array<{
      id: string;
      title: string;
      status: string;
    }>;
    const todo = missions.find((m) => m.status === 'TODO' || m.status === 'DECLINED');
    expect(todo).toBeTruthy();
    await device.post(`/api/me/missions/${todo?.id}/done`, { data: {} });

    await loginAsDemo(page);
    await page.getByRole('button', { name: /Espace parent/ }).click();
    await expect(page.getByRole('heading', { name: /À valider/ })).toBeVisible();
    const row = page
      .locator('li', { hasText: todo?.title ?? '' })
      .filter({ hasText: 'Emilia' })
      .first();
    await row.getByRole('button', { name: /Valider/ }).click();
    await expect(page.getByText('Mission validée pour Emilia !')).toBeVisible();
  });

  test('déconnexion depuis l’espace parent puis accès à la création d’une famille', async ({
    page,
  }) => {
    await loginAsDemo(page);
    await page.getByRole('button', { name: /Espace parent/ }).click();
    await expect(page).toHaveURL(/\/parent/);

    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Connexion parent' })).toBeVisible();
    // La session est révoquée côté serveur : l'API ne reconnaît plus l'appareil.
    expect((await page.request.get('/api/auth/me')).status()).toBe(401);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Se connecter' })).toBeVisible();

    await page.goto('/login');
    await page.getByRole('link', { name: 'Créer une famille' }).click();
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByRole('heading', { name: 'Créer un compte parent' })).toBeVisible();
  });
});
