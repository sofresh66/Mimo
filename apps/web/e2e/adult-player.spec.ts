import { expect, test } from '@playwright/test';

/**
 * Parcours complet « adulte joueur » sur deux appareils : Papa (contexte A) invite Mamie
 * (contexte B), qui crée son compte, rejoint la famille, adopte un compagnon, termine une
 * mission ; Papa la valide en temps réel. Une famille dédiée est créée (la démo n'est pas touchée).
 */
test('Papa invite Mamie, qui joue et fait valider sa mission en temps réel', async ({
  page,
  browser,
}) => {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const familyName = `Famille ${stamp}`;
  const password = 'mot-de-passe-e2e';

  // ── Papa (contexte A) : famille dédiée, créée par l'API (cookies partagés avec la page).
  const papaEmail = `papa-${stamp}@test.local`;
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: { email: papaEmail, password, displayName: 'Papa' },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await page.request.post('/api/family', { data: { name: familyName, parentPin: '2580' } })
    ).ok(),
  ).toBeTruthy();
  expect(
    (
      await page.request.post('/api/children', {
        data: { displayName: 'Léo', avatar: '🦊', color: '#ff8a5c', pin: '1111' },
      })
    ).ok(),
  ).toBeTruthy();

  await page.goto('/parent/settings');
  await expect(page.getByRole('heading', { name: 'Joueurs adultes' })).toBeVisible();
  await expect(page.getByText('Aucun joueur adulte pour le moment.')).toBeVisible();
  await page.getByRole('button', { name: /Inviter un joueur adulte/ }).click();
  const link = await page.getByLabel('Lien d’invitation').inputValue();
  expect(link).toMatch(/\/join-player\/[A-Za-z0-9_-]{43}$/);

  // ── Mamie (contexte B), sur son propre appareil, sans compte.
  const viewport = page.viewportSize();
  const mamieContext = await browser.newContext({
    locale: 'fr-FR',
    reducedMotion: 'reduce',
    ...(viewport ? { viewport } : {}),
  });
  const mamie = await mamieContext.newPage();
  await mamie.goto(link);
  await expect(
    mamie.getByRole('heading', {
      name: `Papa vous invite à rejoindre la famille ${familyName} dans Mimo`,
    }),
  ).toBeVisible();
  await expect(mamie.getByRole('link', { name: 'J’ai déjà un compte' })).toBeVisible();
  await mamie.getByRole('link', { name: 'Créer mon compte' }).click();

  const mamieEmail = `mamie-${stamp}@test.local`;
  await mamie.getByLabel('Comment les enfants vous appellent-ils ?').fill('Mamie');
  await mamie.getByLabel('Adresse e-mail').fill(mamieEmail);
  await mamie.getByLabel('Mot de passe').fill(password);
  await mamie.getByRole('button', { name: 'Créer mon compte' }).click();

  // Retour sur l'invitation : confirmation + configuration du profil de jeu.
  await expect(
    mamie.getByText(`Rejoindre la famille « ${familyName} » comme joueur adulte ?`),
  ).toBeVisible();
  await expect(mamie.getByLabel('Votre nom dans le jeu')).toHaveValue('Mamie');
  await mamie.getByRole('button', { name: 'Rejoindre comme joueur adulte' }).click();

  // Directement dans le jeu, sans reconnexion : adoption de son propre compagnon.
  await expect(mamie).toHaveURL(/\/play\/adopt$/);
  await mamie.getByRole('radio').first().click();
  await mamie.getByLabel('Comment veux-tu l’appeler ?').fill('Plume');
  await mamie.getByRole('button', { name: /Adopter/ }).click();
  await expect(mamie.getByRole('heading', { name: /Bonjour Mamie/ })).toBeVisible();
  await expect(mamie.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();

  // Aucun accès à l'espace parent : retour au jeu.
  await mamie.goto('/parent');
  await expect(mamie).toHaveURL(/\/play$/);

  // ── Papa voit Mamie dans les joueurs adultes et lui attribue une mission.
  await page.reload();
  await expect(page.getByText(mamieEmail)).toBeVisible();
  const profiles = (await (await page.request.get('/api/profiles')).json()) as Array<{
    id: string;
    type: string;
  }>;
  const mamieProfile = profiles.find((p) => p.type === 'ADULT');
  expect(mamieProfile).toBeTruthy();
  const mission = await page.request.post('/api/missions', {
    data: {
      title: 'Tricoter une écharpe',
      category: 'CREATIVITY',
      icon: '🧶',
      xp: 30,
      coins: 5,
      recurrence: 'ONCE',
      assignedChildId: mamieProfile?.id,
    },
  });
  expect(mission.ok()).toBeTruthy();
  await page.goto('/parent');

  // ── Mamie envoie la mission pour validation.
  await mamie.goto('/play/missions');
  const card = mamie.locator('li', { hasText: 'Tricoter une écharpe' });
  await card.getByRole('button', { name: 'Envoyer pour validation' }).click();
  await expect(card.getByText('En attente de validation')).toBeVisible();

  // ── Papa reçoit la demande en temps réel (sans recharger) et valide.
  const request = page.locator('li', {
    hasText: 'Tricoter une écharpe',
    has: page.getByRole('button', { name: /Valider/ }),
  });
  await expect(request).toBeVisible();
  await expect(request).toContainText('Adulte joueur');
  await request.getByRole('button', { name: /Valider/ }).click();

  // ── Mamie voit la validation en temps réel.
  const dialog = mamie.getByRole('alertdialog');
  await expect(dialog.getByText('Mission validée !')).toBeVisible();
  await expect(dialog.getByText('Papa vient de valider « Tricoter une écharpe »')).toBeVisible();
  await expect(dialog.getByText('+30 XP')).toBeVisible();

  await mamieContext.close();
});
