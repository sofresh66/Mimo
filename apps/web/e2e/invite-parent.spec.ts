import { expect, test } from '@playwright/test';
import { loginAsDemo, typePin } from './helpers';

test('un parent invite son conjoint qui crée son compte et rejoint la famille', async ({
  page,
  browser,
}) => {
  // Parent déjà membre : génère un lien d'invitation.
  await loginAsDemo(page);
  await page.getByRole('button', { name: /Espace parent/ }).click();
  await page.goto('/parent/settings');
  await expect(page.getByRole('heading', { name: 'Parents de la famille' })).toBeVisible();
  await page.getByRole('button', { name: /Inviter un parent/ }).click();
  const link = await page.getByLabel('Lien d’invitation').inputValue();
  expect(link).toMatch(/\/join-parent\/[A-Za-z0-9_-]{43}$/);
  await expect(page.getByText('Invitations en attente')).toBeVisible();

  // Conjoint, sur un autre appareil, sans compte.
  const spouseContext = await browser.newContext({ locale: 'fr-FR', reducedMotion: 'reduce' });
  const spouse = await spouseContext.newPage();
  await spouse.goto(link);
  await expect(
    spouse.getByRole('heading', { name: 'Rejoindre la famille « Les Étoiles »' }),
  ).toBeVisible();
  await expect(spouse.getByText('Invitation de Papa')).toBeVisible();
  await spouse.getByRole('link', { name: 'Créer mon compte' }).click();

  const email = `conjoint-${Date.now()}@test.local`;
  await spouse.getByLabel('Comment les enfants vous appellent-ils ?').fill('Maman');
  await spouse.getByLabel('Adresse e-mail').fill(email);
  await spouse.getByLabel('Mot de passe').fill('mot-de-passe-de-maman');
  await spouse.getByRole('button', { name: 'Créer mon compte' }).click();

  // Retour sur l'invitation : confirmation + PIN parent personnel.
  await expect(
    spouse.getByText('Rejoindre la famille « Les Étoiles » en tant que parent ?'),
  ).toBeVisible();
  await expect(spouse.getByText(`Connecté en tant que ${email}`)).toBeVisible();
  await spouse.getByLabel('Votre code PIN parent (4 chiffres)').fill('8642');
  await spouse.getByRole('button', { name: 'Rejoindre la famille' }).click();

  // Même famille : mêmes enfants dans l'espace parent.
  await expect(spouse).toHaveURL(/\/parent$/);
  await expect(spouse.getByRole('heading', { name: /Haylie/ })).toBeVisible();
  await expect(spouse.getByRole('heading', { name: /Emilia/ })).toBeVisible();

  // Son propre PIN parent ouvre l'espace parent sur son appareil.
  await spouse.getByRole('button', { name: /Verrouiller/ }).click();
  await spouse.getByRole('button', { name: /Espace parent/ }).click();
  await typePin(spouse, '8642');
  await expect(spouse).toHaveURL(/\/parent/);

  // Le lien est à usage unique.
  const reused = await spouseContext.newPage();
  await reused.goto(link);
  await expect(
    reused.getByRole('heading', { name: 'Ce lien d’invitation n’est plus valide.' }),
  ).toBeVisible();

  // Le premier parent voit le nouveau parent dans la liste.
  await page.reload();
  await expect(page.getByText(email)).toBeVisible();
  await spouseContext.close();
});
