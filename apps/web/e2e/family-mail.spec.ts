import { expect, test, type Browser, type Page } from '@playwright/test';
import { dismissAbsence } from './helpers';

/**
 * Boîte aux lettres familiale, sur une famille dédiée (la démo n'est pas touchée) : Léa écrit
 * à Noé ; la boîte aux lettres de Noé s'anime en direct ; Noé lit et garde la lettre ; le
 * parent la retrouve en lecture seule dans l'espace parent.
 */
const PASSWORD = 'mot-de-passe-e2e';

function uid() {
  return `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
}

async function newContext(browser: Browser, page: Page) {
  const context = await browser.newContext({
    locale: 'fr-FR',
    reducedMotion: 'reduce',
    viewport: page.viewportSize(),
    hasTouch: true,
  });
  return { context, page: await context.newPage() };
}

test('écrire, recevoir en direct, lire, garder précieusement ; supervision parent', async ({
  browser,
  page,
}) => {
  const email = `courrier-${uid()}@test.local`;
  const papa = await newContext(browser, page);
  const api = papa.page.request;
  await api.post('/api/auth/register', {
    data: { email, password: PASSWORD, displayName: 'Papa' },
  });
  await api.post('/api/family', { data: { name: 'Famille courrier', parentPin: '2580' } });
  const create = async (displayName: string, avatar: string, pin: string) =>
    (
      await api.post('/api/children', {
        data: { displayName, avatar, color: '#ff8a5c', pin },
      })
    ).json() as Promise<{ id: string }>;
  const lea = await create('Léa', '🦊', '1111');
  const noe = await create('Noé', '🐼', '2222');
  const kid = async (id: string, pin: string, name: string) => {
    const k = await newContext(browser, page);
    await k.page.request.post('/api/auth/login', { data: { email, password: PASSWORD } });
    await k.page.request.post('/api/auth/unlock/child', { data: { childId: id, pin } });
    await k.page.request.post('/api/me/creature/adopt', { data: { speciesId: 'dragon', name } });
    return k;
  };
  const a = await kid(lea.id, '1111', 'Luna');
  const b = await kid(noe.id, '2222', 'Roux');

  // Noé est sur son accueil : boîte aux lettres discrète.
  await b.page.goto('/play');
  await dismissAbsence(b.page);
  const mailbox = b.page.getByTestId('mailbox');
  await expect(mailbox).toHaveAccessibleName('Ouvrir la boîte aux lettres');

  // Léa écrit à Noé.
  await a.page.goto('/play');
  await dismissAbsence(a.page);
  await a.page.getByTestId('mailbox').click();
  await a.page.getByTestId('write-letter').click();
  const composer = a.page.getByRole('dialog', { name: 'Écrire une lettre' });
  await composer.getByRole('radio', { name: 'Noé' }).click();
  await expect(composer.getByRole('radio', { name: 'Papier Mimo' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(composer.getByText('Tes parents peuvent lire tes lettres.')).toBeVisible();
  await composer
    .getByTestId('letter-text')
    .fill('Coucou Noé ! On joue demain ? 🐉 https://exemple.test');
  await composer.getByTestId('send-letter').click();
  await expect(a.page.getByText('Lettre envoyée à Noé ! ✉️')).toBeVisible();
  await a.page.getByRole('tab', { name: /Envoyées/ }).click();
  await expect(a.page.getByTestId('letters')).toContainText('Pour Noé');

  // Noé est prévenu en direct (sans recharger) : toast, boîte animée et badge.
  await expect(b.page.getByText('Léa & Luna t’ont envoyé une lettre ! 💌').first()).toBeVisible();
  await expect(mailbox).toHaveAccessibleName(/1 nouveau/);
  await mailbox.click();
  await b.page.getByTestId('letters').getByRole('button').first().click();
  const reader = b.page.getByRole('dialog', { name: 'Lettre de Léa' });
  await expect(reader.getByTestId('letter-paper')).toContainText(
    'Coucou Noé ! On joue demain ? 🐉',
  );
  // Aucun lien cliquable dans une lettre.
  await expect(reader.getByRole('link')).toHaveCount(0);
  await reader.getByRole('button', { name: '⭐ Garder précieusement' }).click();
  await expect(reader.getByRole('button', { name: '⭐ Gardée précieusement' })).toBeVisible();
  await reader.getByRole('button', { name: 'Fermer' }).click();
  await b.page.getByRole('tab', { name: /Souvenirs/ }).click();
  await expect(b.page.getByTestId('letters')).toContainText('De Léa');
  await b.page.screenshot({ path: test.info().outputPath('souvenirs.png') });

  // Lettre lue : la boîte aux lettres redevient discrète.
  await b.page.goto('/play');
  await expect(b.page.getByTestId('mailbox')).toHaveAccessibleName('Ouvrir la boîte aux lettres');

  // Supervision parent (PIN requis) : courrier de Léa, en lecture seule.
  // (Papa n'a encore ouvert aucune page : pas de chargement de session concurrent.)
  await papa.page.request.post('/api/auth/lock');
  await papa.page.request.post('/api/auth/unlock/parent', { data: { pin: '2580' } });
  await papa.page.goto(`/parent/children/${lea.id}`);
  const supervision = papa.page.getByTestId('child-letters');
  await supervision.getByRole('tab', { name: /Envoyées/ }).click();
  await expect(supervision.getByTestId('letters')).toContainText('Pour Noé');

  await a.context.close();
  await b.context.close();
  await papa.context.close();
});
