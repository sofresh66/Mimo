import {
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

export const DEMO = { email: 'demo@mimo.local', password: 'MimoDemo2026!', parentPin: '1234' };
export const KIDS = {
  haylie: { name: 'Haylie', pin: '1111' },
  emilia: { name: 'Emilia', pin: '2222' },
  jude: { name: 'Jude', pin: '3333' },
};

export async function loginAsDemo(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Adresse e-mail').fill(DEMO.email);
  await page.getByLabel('Mot de passe').fill(DEMO.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Qui joue ?')).toBeVisible();
}

/** Saisit un PIN sur le pavé numérique (clics sur les touches). */
export async function typePin(page: Page, pin: string): Promise<void> {
  const pad = page.getByRole('dialog');
  for (const digit of pin) await pad.getByRole('button', { name: digit, exact: true }).click();
}

export async function playAs(page: Page, kid: { name: string; pin: string }): Promise<void> {
  await page.getByRole('button', { name: new RegExp(kid.name) }).click();
  await typePin(page, kid.pin);
  await expect(
    page.getByRole('heading', { name: new RegExp(`Bonjour ${kid.name}`) }),
  ).toBeVisible();
}

/** Second « appareil » : un parent connecté via l'API (pour valider pendant que l'enfant joue). */
export async function parentApi(baseURL: string): Promise<APIRequestContext> {
  const api = await playwrightRequest.newContext({ baseURL });
  const res = await api.post('/api/auth/login', {
    data: { email: DEMO.email, password: DEMO.password },
  });
  expect(res.ok()).toBeTruthy();
  return api;
}

export async function childId(api: APIRequestContext, name: string): Promise<string> {
  const profiles = (await (await api.get('/api/profiles')).json()) as Array<{
    id: string;
    displayName: string;
  }>;
  const found = profiles.find((p) => p.displayName === name);
  if (!found) throw new Error(`Profil introuvable : ${name}`);
  return found.id;
}
