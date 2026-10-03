import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { typePin } from './helpers';

/**
 * Session persistante : e-mail + mot de passe une seule fois par appareil. À la réouverture
 * (cookie d'accès de 15 min expiré), la session est restaurée silencieusement par le refresh
 * token ; l'espace parent se rouvre avec le PIN parent. Familles dédiées (la démo n'est pas touchée).
 */
const PASSWORD = 'mot-de-passe-e2e';
const PARENT_PIN = '2580';
const CHILD_PIN = '1111';

function uid() {
  return `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
}

/** Famille dédiée créée par l'API dans le contexte de la page (cookies partagés). */
async function newFamily(page: Page) {
  const email = `persist-${uid()}@test.local`;
  await page.request.post('/api/auth/register', {
    data: { email, password: PASSWORD, displayName: 'Papa' },
  });
  await page.request.post('/api/family', { data: { name: 'Persistance', parentPin: PARENT_PIN } });
  await page.request.post('/api/children', {
    data: { displayName: 'Léa', avatar: '🦊', color: '#ff8a5c', pin: CHILD_PIN },
  });
  return email;
}

/**
 * Ferme l'application puis la rouvre « plus tard » : nouveau contexte navigateur avec les cookies
 * persistés, SANS le cookie d'accès (expiré au bout de 15 min). Seul le refresh token reste.
 */
async function reopenLater(browser: Browser, context: BrowserContext, page: Page) {
  const state = await context.storageState();
  await context.close();
  const reopened = await browser.newContext({
    storageState: { ...state, cookies: state.cookies.filter((c) => c.name !== 'mimo_at') },
    locale: 'fr-FR',
    reducedMotion: 'reduce',
    viewport: page.viewportSize(),
  });
  const next = await reopened.newPage();
  const refreshes: string[] = [];
  next.on('request', (r) => {
    if (r.url().endsWith('/api/auth/refresh')) refreshes.push(r.url());
  });
  return { context: reopened, page: next, refreshes };
}

async function freshContext(browser: Browser, page: Page) {
  const context = await browser.newContext({
    locale: 'fr-FR',
    reducedMotion: 'reduce',
    viewport: page.viewportSize(),
  });
  return { context, page: await context.newPage() };
}

test.describe('Session persistante', () => {
  test('connexion puis réouverture : toujours connecté, sans e-mail ni mot de passe', async ({
    browser,
    page,
  }) => {
    const setup = await freshContext(browser, page);
    const email = await newFamily(setup.page);
    await setup.context.close();

    // 1. Connexion normale (une seule fois sur cet appareil).
    const first = await freshContext(browser, page);
    await first.page.goto('/login');
    await first.page.getByLabel('Adresse e-mail').fill(email);
    await first.page.getByLabel('Mot de passe').fill(PASSWORD);
    await first.page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(first.page.getByText('Qui joue ?')).toBeVisible();
    const cookies = await first.context.cookies();
    expect(cookies.find((c) => c.name === 'mimo_rt')?.httpOnly).toBe(true);
    expect(cookies.find((c) => c.name === 'mimo_at')?.httpOnly).toBe(true);

    // 2 + 3. Fermeture, réouverture après expiration du jeton d'accès : refresh silencieux.
    const later = await reopenLater(browser, first.context, first.page);
    await later.page.goto('/');
    await expect(later.page.getByText('Qui joue ?')).toBeVisible();
    await expect(later.page.getByRole('link', { name: 'Se connecter' })).toHaveCount(0);
    expect(later.refreshes).toHaveLength(1);
    expect((await later.context.cookies()).some((c) => c.name === 'mimo_at')).toBe(true);
    // Aucun jeton dans le stockage du navigateur.
    const stored = await later.page.evaluate(() => JSON.stringify({ ...localStorage }));
    expect(stored).not.toMatch(/eyJ|mimo_rt|mimo_at/);
    await later.context.close();
  });

  test('espace parent verrouillé : le PIN parent suffit, même après réouverture', async ({
    browser,
    page,
  }) => {
    const app = await freshContext(browser, page);
    await newFamily(app.page);
    await app.page.goto('/parent');
    await app.page.getByRole('button', { name: /Verrouiller/ }).click();
    await expect(app.page.getByText('Qui joue ?')).toBeVisible();

    const later = await reopenLater(browser, app.context, app.page);
    await later.page.goto('/');
    await expect(later.page.getByText('Qui joue ?')).toBeVisible();
    await later.page.getByRole('button', { name: /Espace parent/ }).click();
    await typePin(later.page, PARENT_PIN);
    await expect(later.page).toHaveURL(/\/parent/);
    await expect(later.page.getByRole('button', { name: /Verrouiller/ })).toBeVisible();
    await later.context.close();
  });

  test('enfant : sélection du profil + PIN, puis session conservée à la réouverture', async ({
    browser,
    page,
  }) => {
    const app = await freshContext(browser, page);
    await newFamily(app.page);
    await app.page.goto('/');
    await app.page.getByRole('button', { name: /Léa/ }).click();
    await typePin(app.page, CHILD_PIN);
    await expect(app.page).toHaveURL(/\/play\/adopt$/);

    const later = await reopenLater(browser, app.context, app.page);
    await later.page.goto('/play');
    await expect(later.page).toHaveURL(/\/play\/adopt$/);
    await expect(later.page.getByRole('heading', { name: 'Choisis ton compagnon' })).toBeVisible();
    await later.context.close();
  });

  test('adulte joueur (Mamie) : session persistante également', async ({ browser, page }) => {
    const papa = await freshContext(browser, page);
    await newFamily(papa.page);
    const invitation = (await (
      await papa.page.request.post('/api/family/invitations', { data: { role: 'ADULT_PLAYER' } })
    ).json()) as { token: string };
    await papa.context.close();

    const mamie = await freshContext(browser, page);
    await mamie.page.request.post('/api/auth/register', {
      data: { email: `mamie-${uid()}@test.local`, password: PASSWORD, displayName: 'Mamie' },
    });
    await mamie.page.request.post(`/api/invitations/${invitation.token}/accept`, { data: {} });
    await mamie.page.goto('/');
    await expect(mamie.page).toHaveURL(/\/play\/adopt$/);

    const later = await reopenLater(browser, mamie.context, mamie.page);
    await later.page.goto('/');
    await expect(later.page).toHaveURL(/\/play\/adopt$/);
    await expect(later.page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
    await later.context.close();
  });

  test('refresh expiré ou session révoquée : retour à la connexion, sans boucle', async ({
    browser,
    page,
  }) => {
    // Refresh token expiré : plus aucun cookie.
    const expired = await freshContext(browser, page);
    await newFamily(expired.page);
    await expired.context.clearCookies();
    await expired.page.goto('/');
    await expect(expired.page.getByRole('link', { name: 'Se connecter' })).toBeVisible();
    await expired.context.close();

    // Session révoquée depuis un autre appareil (« déconnecter tous les appareils »).
    const device = await freshContext(browser, page);
    const email = await newFamily(device.page);
    await device.page.goto('/');
    await expect(device.page.getByText('Qui joue ?')).toBeVisible();
    const other = await freshContext(browser, page);
    await other.page.request.post('/api/auth/login', { data: { email, password: PASSWORD } });
    expect((await other.page.request.post('/api/auth/logout-all')).ok()).toBeTruthy();
    await other.context.close();

    const refreshes: string[] = [];
    device.page.on('request', (r) => {
      if (r.url().endsWith('/api/auth/refresh')) refreshes.push(r.url());
    });
    await device.page.reload();
    await expect(device.page.getByRole('link', { name: 'Se connecter' })).toBeVisible();
    await device.page.waitForTimeout(500);
    expect(refreshes.length).toBeLessThanOrEqual(1);
    expect((await device.context.cookies()).some((c) => c.name === 'mimo_rt')).toBe(false);
    await device.context.close();
  });

  test('logout : cookies supprimés et écran de connexion', async ({ browser, page }) => {
    const app = await freshContext(browser, page);
    await newFamily(app.page);
    await app.page.goto('/parent');
    await app.page.getByRole('button', { name: /Se déconnecter/ }).click();
    await expect(app.page).toHaveURL(/\/login/);
    const names = (await app.context.cookies()).map((c) => c.name);
    expect(names).not.toContain('mimo_at');
    expect(names).not.toContain('mimo_rt');
    await app.page.goto('/');
    await expect(app.page.getByRole('link', { name: 'Se connecter' })).toBeVisible();
    await app.context.close();
  });
});
