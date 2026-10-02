'use client';

import type {
  HatchResult,
  InventoryEntry,
  InventoryView,
  ItemCategory,
  LootView,
} from '@mimo/types';
import {
  Button,
  Card,
  CreatureCard,
  EmptyState,
  InventorySlot,
  Modal,
  RarityBadge,
  Spinner,
  cx,
} from '@mimo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useCelebrations } from '@/components/Celebrations';
import { Field } from '@/components/forms';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { equipmentEmojis } from '@/lib/creature';
import { useErrorMessage } from '@/lib/errors';
import { keys, useCreatures, useInventory } from '@/lib/queries';
import { playSound } from '@/lib/sound';

const FILTERS: Array<ItemCategory | 'ALL'> = [
  'ALL',
  'FOOD',
  'ACCESSORY',
  'OBJECT',
  'MATERIAL',
  'DECORATION',
  'SPECIAL',
  'CHEST',
];

export default function InventoryPage() {
  const { t } = useI18n();
  const { data: inventory, isPending } = useInventory();
  const [filter, setFilter] = useState<ItemCategory | 'ALL'>('ALL');
  const [selected, setSelected] = useState<string | null>(null);

  const entries =
    inventory?.entries.filter((e) => filter === 'ALL' || e.item.category === filter) ?? [];
  const selectedEntry = inventory?.entries.find((e) => e.item.id === selected) ?? null;
  const equippedIds = new Set(Object.values(inventory?.equipment ?? {}).map((i) => i?.id));

  return (
    <div>
      <PageHeader title={t('inventory.title')} emoji="🎒" />
      <div
        className="-mx-4 mb-4 overflow-x-auto px-4 [scrollbar-width:none]"
        role="toolbar"
        aria-label={t('inventory.title')}
      >
        <div className="flex w-max gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cx(
                'min-h-10 rounded-full px-4 font-display text-sm font-semibold transition focus-visible:outline-4 focus-visible:outline-primary/50',
                filter === f ? 'bg-primary text-white' : 'bg-white text-ink/70',
              )}
            >
              {f === 'ALL' ? t('inventory.all') : t(`itemCategories.${f}`)}
            </button>
          ))}
        </div>
      </div>

      {isPending || !inventory ? (
        <Spinner size={36} />
      ) : entries.length === 0 ? (
        <EmptyState emoji="📭" title={t('inventory.empty')} />
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {entries.map((e) => (
            <li key={e.item.id}>
              <InventorySlot
                item={e.item}
                quantity={e.quantity}
                selected={selected === e.item.id}
                equipped={
                  equippedIds.has(e.item.id) || inventory.roomDecorations.includes(e.item.id)
                }
                onClick={() => {
                  playSound('pop');
                  setSelected(e.item.id === selected ? null : e.item.id);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {selectedEntry && inventory && (
        <ItemDetail
          entry={selectedEntry}
          inventory={inventory}
          equipped={equippedIds.has(selectedEntry.item.id)}
          onClose={() => setSelected(null)}
        />
      )}

      <MyCreatures />
    </div>
  );
}

function ItemDetail({
  entry,
  inventory,
  equipped,
  onClose,
}: {
  entry: InventoryEntry;
  inventory: InventoryView;
  equipped: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const { celebrate } = useCelebrations();
  const [hatching, setHatching] = useState(false);
  const { item } = entry;
  const inRoom = inventory.roomDecorations.includes(item.id);

  const refresh = () => {
    for (const key of [keys.inventory, keys.home, keys.creatures, keys.village, keys.dex]) {
      void client.invalidateQueries({ queryKey: key });
    }
  };
  const action = useMutation({
    mutationFn: async (kind: 'equip' | 'unequip' | 'eat' | 'donate' | 'room' | 'open') => {
      switch (kind) {
        case 'equip':
        case 'unequip':
          return http.put('/me/equipment', {
            slot: item.slot,
            itemId: kind === 'equip' ? item.id : null,
          });
        case 'eat':
          return http.post('/me/feed', { itemId: item.id });
        case 'donate':
          return http.post<{ points: number }>('/me/village/donate', {
            itemId: item.id,
            quantity: 1,
          });
        case 'room': {
          const next = inRoom
            ? inventory.roomDecorations.filter((d) => d !== item.id)
            : [...inventory.roomDecorations, item.id].slice(-3);
          return http.put('/me/room', { decorations: next });
        }
        case 'open':
          return http.post<LootView>(`/me/chests/${item.id}/open`);
      }
    },
    onSuccess: (data, kind) => {
      playSound(kind === 'open' ? 'open' : 'success');
      refresh();
      if (kind === 'open') {
        celebrate({ kind: 'loot', title: item.name, loot: data as LootView });
        onClose();
      } else if (kind === 'donate') {
        toast(t('inventory.donated', { points: (data as { points: number }).points }), 'success');
      }
      if (entry.quantity <= 1 && (kind === 'eat' || kind === 'donate')) onClose();
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  return (
    <Card
      className="fixed inset-x-3 bottom-24 z-20 mx-auto max-w-xl shadow-2xl ring-2 ring-primary/30"
      role="region"
      aria-label={item.name}
    >
      <div className="flex items-start gap-3">
        <span className="text-5xl" aria-hidden="true">
          {item.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold">
            {item.name} <span className="text-ink/50">× {entry.quantity}</span>
          </p>
          <p className="text-sm text-ink/70">{item.description}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <RarityBadge rarity={item.rarity} label={t(`rarities.${item.rarity}`)} />
            {item.slot && (
              <span className="text-xs font-semibold text-ink/60">{t(`slots.${item.slot}`)}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="grid size-10 place-items-center rounded-full text-xl hover:bg-ink/5"
        >
          ×
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {item.category === 'FOOD' && (
          <Button size="sm" onClick={() => action.mutate('eat')} loading={action.isPending}>
            🍽 {t('inventory.eat')}
          </Button>
        )}
        {item.category === 'ACCESSORY' && (
          <Button
            size="sm"
            variant={equipped ? 'secondary' : 'primary'}
            onClick={() => action.mutate(equipped ? 'unequip' : 'equip')}
            loading={action.isPending}
          >
            {equipped ? t('inventory.unequip') : `✨ ${t('inventory.equip')}`}
          </Button>
        )}
        {item.category === 'MATERIAL' && (
          <Button
            size="sm"
            variant="success"
            onClick={() => action.mutate('donate')}
            loading={action.isPending}
          >
            🏡 {t('inventory.donate')}
          </Button>
        )}
        {item.category === 'DECORATION' && (
          <Button
            size="sm"
            variant={inRoom ? 'secondary' : 'primary'}
            onClick={() => action.mutate('room')}
            loading={action.isPending}
          >
            {inRoom ? t('inventory.removeFromRoom') : `🛋 ${t('inventory.place')}`}
          </Button>
        )}
        {item.category === 'CHEST' && (
          <Button size="sm" onClick={() => action.mutate('open')} loading={action.isPending}>
            🔓 {t('inventory.open')}
          </Button>
        )}
        {item.category === 'SPECIAL' && (
          <Button size="sm" onClick={() => setHatching(true)}>
            🐣 {t('inventory.hatch')}
          </Button>
        )}
      </div>
      <HatchModal
        open={hatching}
        itemId={item.id}
        onClose={() => setHatching(false)}
        onDone={() => {
          refresh();
          onClose();
        }}
      />
    </Card>
  );
}

function HatchModal({
  open,
  itemId,
  onClose,
  onDone,
}: {
  open: boolean;
  itemId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') ?? '');
    setBusy(true);
    try {
      await http.post<HatchResult>(`/me/eggs/${itemId}/hatch`, { name });
      playSound('levelup');
      onClose();
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={t('inventory.hatchTitle')} size="sm">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label={t('inventory.hatchName')} name="name" maxLength={20} required />
        {error && (
          <p role="alert" className="font-semibold text-coral">
            {error}
          </p>
        )}
        <Button type="submit" loading={busy} block>
          🐣 {t('inventory.hatch')}
        </Button>
      </form>
    </Modal>
  );
}

function MyCreatures() {
  const { t } = useI18n();
  const client = useQueryClient();
  const { data: creatures } = useCreatures();
  const activate = useMutation({
    mutationFn: (id: string) => http.post(`/me/creatures/${id}/activate`),
    onSuccess: () => {
      playSound('success');
      for (const key of [keys.creatures, keys.home, keys.inventory])
        void client.invalidateQueries({ queryKey: key });
    },
  });
  if (!creatures || creatures.length < 2) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-xl font-bold">{t('inventory.myCreatures')}</h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {creatures.map((c) => (
          <li key={c.id}>
            <CreatureCard
              name={c.name}
              subtitle={`${c.formName} · ${t('common.level', { level: c.level })}`}
              appearance={c.appearance}
              equipment={equipmentEmojis(c.equipment)}
              mood={c.mood}
              size={110}
              footer={
                c.isActive ? (
                  <p className="mt-2 text-sm font-bold text-mint">✓ {t('inventory.active')}</p>
                ) : (
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={() => activate.mutate(c.id)}
                    disabled={c.isExploring}
                  >
                    {t('inventory.activate')}
                  </Button>
                )
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
