'use client';

import type { ChildHome, CookResult, FeedResult, InventoryView } from '@mimo/types';
import {
  Button,
  Card,
  Creature,
  EmptyState,
  InventorySlot,
  RarityBadge,
  Spinner,
  Tabs,
  type CreatureReaction,
} from '@mimo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { equipmentEmojis } from '@/lib/creature';
import { useErrorMessage } from '@/lib/errors';
import { keys, useHome, useInventory, useRecipes, useShop } from '@/lib/queries';
import { playSound } from '@/lib/sound';

type Tab = 'feed' | 'cook' | 'shop' | 'recipes';

export default function KitchenPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('feed');
  const { data: home } = useHome();
  const [reaction, setReaction] = useState<{ type: CreatureReaction; key: number }>({
    type: 'idle',
    key: 0,
  });
  const creature = home?.creature;

  return (
    <div>
      <PageHeader title={t('kitchen.title')} emoji="🍳" />
      {creature && (
        <div className="mb-3 flex justify-center">
          <Creature
            appearance={creature.appearance}
            equipment={equipmentEmojis(creature.equipment)}
            mood={creature.mood}
            reaction={reaction.type}
            reactionKey={reaction.key}
            size={150}
            label={`${creature.name}, ${creature.formName}`}
          />
        </div>
      )}
      <Tabs<Tab>
        label={t('kitchen.title')}
        value={tab}
        onChange={setTab}
        className="mb-4"
        items={[
          { key: 'feed', label: t('kitchen.feedTab'), icon: <span aria-hidden="true">🍎</span> },
          { key: 'cook', label: t('kitchen.cookTab'), icon: <span aria-hidden="true">🥣</span> },
          { key: 'shop', label: t('kitchen.shopTab'), icon: <span aria-hidden="true">🏪</span> },
          {
            key: 'recipes',
            label: t('kitchen.recipesTab'),
            icon: <span aria-hidden="true">📖</span>,
          },
        ]}
      />
      {tab === 'feed' && (
        <FeedTab
          onEat={() => setReaction((r) => ({ type: 'eat', key: r.key + 1 }))}
          name={creature?.name ?? ''}
        />
      )}
      {tab === 'cook' && <CookTab />}
      {tab === 'shop' && <ShopTab />}
      {tab === 'recipes' && <RecipesTab />}
    </div>
  );
}

function FeedTab({ onEat, name }: { onEat: () => void; name: string }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { data: inventory, isPending } = useInventory();
  const foods = inventory?.entries.filter((e) => e.item.category === 'FOOD') ?? [];

  const feed = useMutation({
    mutationFn: (itemId: string) => http.post<FeedResult>('/me/feed', { itemId }),
    onSuccess: (result, itemId) => {
      playSound('eat');
      onEat();
      client.setQueryData<ChildHome>(keys.home, (old) =>
        old ? { ...old, creature: result.creature } : old,
      );
      client.setQueryData<InventoryView>(keys.inventory, (old) =>
        old
          ? {
              ...old,
              entries: old.entries
                .map((e) => (e.item.id === itemId ? { ...e, quantity: e.quantity - 1 } : e))
                .filter((e) => e.quantity > 0),
            }
          : old,
      );
      toast(t('kitchen.yum', { name }), 'success');
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  if (isPending) return <Spinner size={32} />;
  if (foods.length === 0) return <EmptyState emoji="🧺" title={t('kitchen.noFood')} />;
  return (
    <>
      <p className="mb-3 text-ink/70">{t('kitchen.feedHint', { name })}</p>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {foods.map((e) => (
          <li key={e.item.id}>
            <InventorySlot
              item={e.item}
              quantity={e.quantity}
              disabled={feed.isPending}
              onClick={() => feed.mutate(e.item.id)}
              label={`${t('inventory.eat')} : ${e.item.name} (${e.quantity})`}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function CookTab() {
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { data: inventory } = useInventory();
  const [pot, setPot] = useState<string[]>([]);
  const [result, setResult] = useState<CookResult | null>(null);
  const foods = inventory?.entries.filter((e) => e.item.category === 'FOOD') ?? [];
  const countInPot = (id: string) => pot.filter((p) => p === id).length;

  const cook = useMutation({
    mutationFn: () => http.post<CookResult>('/me/cook', { ingredients: pot }),
    onSuccess: (res) => {
      setResult(res);
      setPot([]);
      playSound(res.success ? (res.newlyDiscovered ? 'levelup' : 'success') : 'pop');
      if (res.success) {
        void client.invalidateQueries({ queryKey: keys.inventory });
        void client.invalidateQueries({ queryKey: keys.recipes });
      }
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink/70">{t('kitchen.cookHint')}</p>
      <Card className="flex flex-col items-center gap-3">
        <div
          className="flex min-h-20 items-center justify-center gap-2 text-5xl"
          aria-live="polite"
        >
          <span aria-hidden="true">🥣</span>
          {pot.map((id, i) => (
            <motion.span
              key={`${id}-${i}`}
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
            >
              {foods.find((f) => f.item.id === id)?.item.emoji}
            </motion.span>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setPot([])} disabled={pot.length === 0}>
            {t('kitchen.clear')}
          </Button>
          <Button onClick={() => cook.mutate()} disabled={pot.length < 2} loading={cook.isPending}>
            ✨ {t('kitchen.cook')}
          </Button>
        </div>
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
              role="status"
            >
              {result.success && result.result ? (
                <>
                  <p className="text-6xl" aria-hidden="true">
                    {result.result.emoji}
                  </p>
                  {result.newlyDiscovered && (
                    <p className="font-display font-bold text-coral">{t('kitchen.newRecipe')}</p>
                  )}
                  <p className="font-display text-lg font-bold">
                    {t('kitchen.cookSuccess', { name: result.result.name })}
                  </p>
                </>
              ) : (
                <p className="text-ink/70">{t('kitchen.cookFail')}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {foods.map((e) => {
          const remaining = e.quantity - countInPot(e.item.id);
          return (
            <li key={e.item.id}>
              <InventorySlot
                item={e.item}
                quantity={remaining}
                selected={countInPot(e.item.id) > 0}
                disabled={remaining <= 0 || pot.length >= 3}
                onClick={() => {
                  playSound('pop');
                  setResult(null);
                  setPot((p) => [...p, e.item.id]);
                }}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ShopTab() {
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { data: shop, isPending } = useShop();
  const { data: home } = useHome();
  const coins = home?.coins ?? 0;

  const buy = useMutation({
    mutationFn: (itemId: string) =>
      http.post<InventoryView>('/me/shop/buy', { itemId, quantity: 1 }),
    onSuccess: (inventory, itemId) => {
      playSound('coin');
      client.setQueryData(keys.inventory, inventory);
      client.setQueryData<ChildHome>(keys.home, (old) =>
        old ? { ...old, coins: inventory.coins } : old,
      );
      toast(
        t('kitchen.bought', { name: shop?.find((i) => i.id === itemId)?.name ?? '' }),
        'success',
      );
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  if (isPending || !shop) return <Spinner size={32} />;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {shop.map((item) => (
        <li key={item.id}>
          <Card className="flex items-center gap-3 p-3">
            <span className="text-4xl" aria-hidden="true">
              {item.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display font-bold">{item.name}</p>
              <p className="truncate text-sm text-ink/60">{item.description}</p>
              <RarityBadge rarity={item.rarity} label={t(`rarities.${item.rarity}`)} />
            </div>
            <Button
              size="sm"
              variant={coins >= (item.price ?? 0) ? 'primary' : 'secondary'}
              disabled={coins < (item.price ?? 0) || buy.isPending}
              onClick={() => buy.mutate(item.id)}
              aria-label={`${t('kitchen.buy')} ${item.name}, ${item.price} pièces`}
            >
              💰 {item.price}
            </Button>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function RecipesTab() {
  const { t } = useI18n();
  const { data: recipes, isPending } = useRecipes();
  if (isPending || !recipes) return <Spinner size={32} />;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {recipes.map((r) => (
        <li key={r.id}>
          <Card className="flex items-center gap-3 p-3">
            <span className="text-4xl" aria-hidden="true">
              {r.discovered ? r.result?.emoji : '❔'}
            </span>
            <div>
              <p className="font-display font-bold">
                {r.discovered ? r.name : t('kitchen.unknownRecipe')}
              </p>
              <p className="text-sm text-ink/60">
                {r.discovered
                  ? r.ingredients?.map((i) => `${i.emoji} ${i.name}`).join(' + ')
                  : `💡 ${r.hint}`}
              </p>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
