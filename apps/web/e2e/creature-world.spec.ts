import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';

/**
 * Espace personnalisable et monde vivant entre créatures, sur une famille dédiée (la démo
 * n'est pas touchée) : décoration au doigt, décor gagné par une quête, « Pendant ton
 * absence… », « Jouer ensemble » avec visite visible et notification en temps réel.
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

/** Famille : Papa + Léa + Noé, chacun sur son appareil, avec un compagnon adopté. */
async function setupFamily(browser: Browser, page: Page) {
  const email = `monde-${uid()}@test.local`;
  const papa = await newContext(browser, page);
  const api = papa.page.request;
  await api.post('/api/auth/register', {
    data: { email, password: PASSWORD, displayName: 'Papa' },
  });
  await api.post('/api/family', { data: { name: 'Monde vivant', parentPin: '2580' } });
  const lea = await (
    await api.post('/api/children', {
      data: { displayName: 'Léa', avatar: '🦊', color: '#ff8a5c', pin: '1111' },
    })
  ).json();
  const noe = await (
    await api.post('/api/children', {
      data: { displayName: 'Noé', avatar: '🐼', color: '#3fb6e8', pin: '2222' },
    })
  ).json();
  const kid = async (id: string, pin: string, species: string, name: string) => {
    const k = await newContext(browser, page);
    await k.page.request.post('/api/auth/login', { data: { email, password: PASSWORD } });
    await k.page.request.post('/api/auth/unlock/child', { data: { childId: id, pin } });
    await k.page.request.post('/api/me/creature/adopt', { data: { speciesId: species, name } });
    return k;
  };
  const a = await kid(lea.id as string, '1111', 'dragon', 'Braise');
  const b = await kid(noe.id as string, '2222', 'fox', 'Roux');
  return { papa, a, b, leaId: lea.id as string };
}

/** Glisser au doigt : événements pointer de type « touch » (comme sur un écran tactile). */
async function touchDrag(target: Locator, scene: Locator, toX: number, toY: number) {
  const box = await scene.boundingBox();
  const from = await target.boundingBox();
  if (!box || !from) throw new Error('scène introuvable');
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: box.x + (box.width * toX) / 100, y: box.y + (box.height * toY) / 100 };
  const base = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true };
  await target.dispatchEvent('pointerdown', { ...base, clientX: start.x, clientY: start.y });
  for (let i = 1; i <= 5; i += 1) {
    await target.dispatchEvent('pointermove', {
      ...base,
      clientX: start.x + ((end.x - start.x) * i) / 5,
      clientY: start.y + ((end.y - start.y) * i) / 5,
    });
  }
  await target.dispatchEvent('pointerup', { ...base, clientX: end.x, clientY: end.y });
}

test.describe('Monde vivant et espace de la créature', () => {
  test('« Pendant ton absence… », puis jouer ensemble : visite et temps réel', async ({
    browser,
    page,
  }) => {
    const f = await setupFamily(browser, page);

    // Première ouverture de Léa : une première interaction avec le Mimo de Noé.
    await f.a.page.goto('/play');
    const dialog = f.a.page.getByRole('dialog', { name: 'Pendant ton absence…' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('absence-events')).toContainText(/Roux|Noé/);
    await dialog.getByRole('button', { name: 'Super !' }).click();
    await expect(dialog).toBeHidden();
    await f.a.page.reload();
    await expect(f.a.page.getByTestId('creature-scene')).toBeVisible();
    await expect(f.a.page.getByRole('dialog', { name: 'Pendant ton absence…' })).toHaveCount(0);

    // Noé est sur son accueil ; Léa propose de jouer ensemble.
    await f.b.page.goto('/play');
    await f.b.page.getByRole('dialog').getByRole('button', { name: 'Super !' }).click();
    await f.a.page.goto('/play/friends');
    const card = f.a.page.getByTestId('friends').getByRole('listitem').first();
    await expect(card).toContainText('Roux, le Mimo de Noé');
    await card.getByRole('button', { name: /Jouer ensemble/ }).click();
    await expect(
      f.a.page
        .getByRole('status')
        .filter({ hasText: /Roux|Noé/ })
        .first(),
    ).toBeVisible();
    await expect(card).toContainText('Encore 2 fois aujourd’hui');
    // Noé est prévenu en direct (sans recharger).
    await expect(f.b.page.getByText(/Ton Mimo|Braise|Léa/).first()).toBeVisible();

    // Le Mimo de Noé est visible chez Léa.
    await f.a.page.goto('/play');
    await expect(f.a.page.getByTestId('visitor')).toBeVisible();
    await f.a.page.screenshot({ path: test.info().outputPath('visite.png') });
    await f.a.context.close();
    await f.b.context.close();
    await f.papa.context.close();
  });

  test('décorer au doigt : placer, déplacer, retourner, ranger ; persistant', async ({
    browser,
    page,
  }) => {
    const f = await setupFamily(browser, page);
    const kid = f.a.page;
    await kid.goto('/play');
    await kid.getByRole('dialog').getByRole('button', { name: 'Super !' }).click();

    await kid.getByRole('button', { name: /Décorer/ }).click();
    await expect(kid.getByRole('heading', { name: /Décorer/ })).toBeVisible();
    // Le ballon fait partie de l'inventaire de départ.
    await kid.getByRole('button', { name: /Ballon/ }).click();
    const scene = kid.getByTestId('creature-scene');
    const ball = scene.locator('[data-placement]').first();
    await expect(ball).toBeVisible();

    await touchDrag(ball, scene, 20, 40);
    await expect(ball).toHaveAttribute('style', /left: 20%/);
    // Impossible de sortir de la zone visible.
    await touchDrag(ball, scene, -30, 140);
    await expect(ball).toHaveAttribute('style', /left: 6%; top: 94%/);
    await touchDrag(ball, scene, 25, 45);

    await kid
      .getByTestId('decor-toolbar')
      .getByRole('button', { name: /Retourner/ })
      .click();
    await kid
      .getByTestId('decor-toolbar')
      .getByRole('button', { name: /Devant/ })
      .click();
    await kid.screenshot({ path: test.info().outputPath('decoration.png') });
    await kid.getByRole('button', { name: /Terminé/ }).click();
    await expect(kid.getByText('Ton espace est enregistré !')).toBeVisible();

    // Persistance après rechargement : position, retournement, couche avant.
    await kid.reload();
    await expect(scene).toBeVisible();
    const saved = await kid.request.get('/api/me/home').then((r) => r.json());
    expect(saved.room.layout).toEqual([
      expect.objectContaining({ x: 25, y: 45, flip: true, layer: 'front' }),
    ]);
    // La créature reste cliquable malgré la décoration au premier plan.
    await scene.getByRole('button', { name: /Braise/ }).click();

    // Décors : seul le décor par défaut est disponible, les autres sont à débloquer.
    await kid.getByRole('button', { name: /Décorer/ }).click();
    await kid.getByRole('tab', { name: /Décors/ }).click();
    const backgrounds = kid.getByTestId('backgrounds');
    await expect(
      backgrounds.getByRole('button', { name: /Chambre Mimo — Décor actuel/ }),
    ).toBeDisabled();
    await expect(backgrounds.getByRole('button', { name: /Plage — À débloquer/ })).toBeDisabled();

    // Ranger : l'objet quitte la scène mais reste dans l'inventaire.
    await kid.getByRole('tab', { name: /Objets/ }).click();
    await scene.locator('[data-placement]').first().click();
    await kid
      .getByTestId('decor-toolbar')
      .getByRole('button', { name: /Ranger/ })
      .click();
    await kid.getByRole('button', { name: /Terminé/ }).click();
    await expect(kid.getByText('Ton espace est enregistré !')).toBeVisible();
    const after = await kid.request.get('/api/me/home').then((r) => r.json());
    expect(after.room.layout).toEqual([]);
    const inventory = await kid.request.get('/api/me/inventory').then((r) => r.json());
    expect(inventory.entries.some((e: { item: { id: string } }) => e.item.id === 'ball')).toBe(
      true,
    );
    await f.a.context.close();
    await f.b.context.close();
    await f.papa.context.close();
  });

  test('un décor gagné par une quête devient disponible et se choisit', async ({
    browser,
    page,
  }) => {
    const f = await setupFamily(browser, page);
    const mission = await (
      await f.papa.page.request.post('/api/missions', {
        data: {
          title: 'Le secret de la forêt',
          category: 'ADVENTURE',
          icon: '🌲',
          xp: 20,
          coins: 5,
          recurrence: 'ONCE',
          assignedChildId: f.leaId,
          rewardItemId: 'bg_forest',
        },
      })
    ).json();
    await f.papa.page.request.post(`/api/missions/${mission.id}/validate`, {
      data: { childId: f.leaId },
    });
    const kid = f.a.page;
    const gifts = (await kid.request.get('/api/me/rewards').then((r) => r.json())) as Array<{
      id: string;
    }>;
    for (const g of gifts) await kid.request.post(`/api/me/rewards/${g.id}/open`);

    await kid.goto('/play');
    await kid.getByRole('dialog').getByRole('button', { name: 'Super !' }).click();
    await kid.getByRole('button', { name: /Décorer/ }).click();
    await kid.getByRole('tab', { name: /Décors/ }).click();
    await kid
      .getByTestId('backgrounds')
      .getByRole('button', { name: /^Forêt enchantée$/ })
      .click();
    await expect(kid.getByText('Nouveau décor : Forêt enchantée !')).toBeVisible();
    await kid.getByRole('button', { name: /Terminé/ }).click();
    await kid.reload();
    const home = await kid.request.get('/api/me/home').then((r) => r.json());
    expect(home.room.background.id).toBe('bg_forest');
    await expect(kid.getByTestId('creature-scene')).toHaveAttribute(
      'style',
      /rgb\(205, 236, 207\)|#cdeccf/i,
    );
    await kid.screenshot({ path: test.info().outputPath('foret.png') });
    await f.a.context.close();
    await f.b.context.close();
    await f.papa.context.close();
  });
});
