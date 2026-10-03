'use client';

import type {
  BackgroundView,
  ChildHome,
  RoomEditorView,
  RoomView,
  SceneUnlockView,
} from '@mimo/types';
import { Button, Card, Spinner, Tabs, cx } from '@mimo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { CreatureScene, type ScenePlacement } from '@/components/CreatureScene';
import { useToast } from '@/components/Toast';
import { useI18n } from '@/i18n';
import { http } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { keys, useRoomEditor } from '@/lib/queries';
import { playSound } from '@/lib/sound';

type Tab = 'backgrounds' | 'objects';

/**
 * Mode décoration : le joueur place, déplace, retourne et range ses objets, puis enregistre
 * toute la disposition en une fois. Le serveur vérifie la possession et borne les positions.
 */
export function RoomEditor({
  creature,
  creatureName,
  onClose,
}: {
  creature: ReactNode;
  creatureName: string;
  onClose: () => void;
}) {
  const { data: editor, isPending } = useRoomEditor();
  if (isPending || !editor) {
    return (
      <Card className="grid place-items-center py-24">
        <Spinner size={36} />
      </Card>
    );
  }
  return (
    <Editor editor={editor} creature={creature} creatureName={creatureName} onClose={onClose} />
  );
}

function Editor({
  editor,
  creature,
  creatureName,
  onClose,
}: {
  editor: RoomEditorView;
  creature: ReactNode;
  creatureName: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [tab, setTab] = useState<Tab>('objects');
  const [draft, setDraft] = useState<ScenePlacement[]>(() => editor.room.layout);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Le décor change immédiatement (aperçu) ; la disposition est enregistrée avec « Terminé ».
  const [room, setRoom] = useState<RoomView>(editor.room);
  const selected = draft.find((p) => p.id === selectedId) ?? null;

  const update = (id: string, patch: Partial<ScenePlacement>) =>
    setDraft((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const placedCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of draft) counts.set(p.item.id, (counts.get(p.item.id) ?? 0) + 1);
    return counts;
  }, [draft]);

  const save = useMutation({
    mutationFn: () =>
      http.put<RoomView>('/me/room/layout', {
        placements: draft.map(({ id, item, x, y, layer, flip }) => ({
          id,
          item: item.id,
          x,
          y,
          layer,
          flip,
        })),
      }),
    onSuccess: (saved) => {
      playSound('success');
      client.setQueryData<ChildHome>(keys.home, (old) => (old ? { ...old, room: saved } : old));
      void client.invalidateQueries({ queryKey: keys.room });
      toast(t('room.saved'), 'success');
      onClose();
    },
    onError: (e) => {
      playSound('error');
      toast(errorMessage(e), 'error');
    },
  });

  const chooseBackground = useMutation({
    mutationFn: (bg: BackgroundView) =>
      http.put<RoomView>('/me/room/background', { itemId: bg.item.id }),
    onSuccess: (saved, bg) => {
      playSound('pop');
      setRoom(saved);
      client.setQueryData<ChildHome>(keys.home, (old) =>
        old ? { ...old, room: { ...old.room, background: saved.background } } : old,
      );
      void client.invalidateQueries({ queryKey: keys.room });
      toast(t('room.backgroundChanged', { name: bg.item.name }), 'success');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const add = (itemId: string) => {
    const entry = editor.placeables.find((p) => p.item.id === itemId);
    if (!entry || draft.length >= editor.maxItems) return;
    playSound('pop');
    // Identifiant libre le plus petit pour cet objet (plusieurs exemplaires possibles).
    const used = new Set(draft.map((p) => p.id));
    let n = 1;
    while (used.has(`${itemId}-${n}`)) n += 1;
    const id = `${itemId}-${n}`;
    // Nouvel objet un peu décalé à chaque ajout, pour ne pas les empiler.
    const offset = (draft.length % 5) * 8 - 16;
    setDraft((list) => [
      ...list,
      { id, item: entry.item, x: 50 + offset, y: 72, layer: 'back', flip: false },
    ]);
    setSelectedId(id);
  };

  const unlockText = (u: SceneUnlockView): string => {
    switch (u.kind) {
      case 'level':
        return t('room.unlock.level', { level: u.level });
      case 'exploration':
        return t('room.unlock.exploration', { zone: u.zoneName });
      case 'friendship':
        return t('room.unlock.friendship', {
          level: t(`friendshipLevels.${FRIENDSHIP_KEYS[u.level] ?? 'FRIENDS'}`),
        });
      default:
        return t(`room.unlock.${u.kind}`);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <CreatureScene
        scene={room.background.scene}
        layout={draft}
        creature={creature}
        label={t('room.sceneLabel', { name: creatureName })}
        editing
        selectedId={selectedId}
        onSelect={setSelectedId}
        onMove={(id, x, y) => update(id, { x, y })}
      />

      <p className="sr-only" role="status">
        {selected ? t('room.selected', { name: selected.item.name }) : ''}
      </p>

      {selected ? (
        <div
          className="flex flex-wrap items-center justify-center gap-2"
          data-testid="decor-toolbar"
        >
          <Button
            size="sm"
            variant="secondary"
            onClick={() => update(selected.id, { flip: !selected.flip })}
          >
            ↔️ {t('room.flip')}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              update(selected.id, { layer: selected.layer === 'front' ? 'back' : 'front' })
            }
          >
            {selected.layer === 'front' ? `⬇️ ${t('room.toBack')}` : `⬆️ ${t('room.toFront')}`}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft((list) => list.filter((p) => p.id !== selected.id));
              setSelectedId(null);
            }}
          >
            🧺 {t('room.remove')}
          </Button>
        </div>
      ) : (
        <p className="text-center text-sm text-ink/60">{t('room.hint')}</p>
      )}

      <Card className="flex flex-col gap-3">
        <Tabs<Tab>
          label={t('room.decorate')}
          value={tab}
          onChange={setTab}
          items={[
            { key: 'objects', label: t('room.tabObjects'), icon: '🧸' },
            { key: 'backgrounds', label: t('room.tabBackgrounds'), icon: '🖼️' },
          ]}
        />
        {tab === 'objects' ? (
          editor.placeables.length === 0 ? (
            <p className="py-4 text-center text-ink/70">{t('room.empty')}</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {editor.placeables.map((p) => {
                const placed = placedCount.get(p.item.id) ?? 0;
                const disabled = placed >= p.owned || draft.length >= editor.maxItems;
                return (
                  <li key={p.item.id}>
                    <button
                      type="button"
                      onClick={() => add(p.item.id)}
                      disabled={disabled}
                      className="flex w-full flex-col items-center gap-0.5 rounded-2xl bg-cream p-2 text-center transition hover:-translate-y-0.5 focus-visible:outline-4 focus-visible:outline-primary/50 disabled:opacity-40"
                    >
                      <span className="text-3xl" aria-hidden="true">
                        {p.item.emoji}
                      </span>
                      <span className="text-xs font-bold leading-tight">{p.item.name}</span>
                      <span className="text-[11px] text-ink/60">
                        {t('room.placed', { placed, owned: p.owned })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="backgrounds">
            {editor.backgrounds.map((bg) => {
              const current = bg.item.id === room.background.id;
              return (
                <li key={bg.item.id}>
                  <button
                    type="button"
                    disabled={!bg.owned || current || chooseBackground.isPending}
                    onClick={() => chooseBackground.mutate(bg)}
                    aria-label={`${bg.item.name}${current ? ` — ${t('room.current')}` : ''}${bg.owned ? '' : ` — ${t('room.locked')}`}`}
                    className={cx(
                      'flex w-full flex-col overflow-hidden rounded-2xl text-left ring-4 transition focus-visible:outline-4 focus-visible:outline-primary/50',
                      current ? 'ring-primary' : 'ring-transparent',
                      !bg.owned && 'grayscale',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="relative grid h-20 place-items-center text-3xl"
                      style={{
                        background: `linear-gradient(180deg, ${bg.scene.sky[0]}, ${bg.scene.sky[1]} 70%, ${bg.scene.ground} 70%)`,
                      }}
                    >
                      {bg.owned ? bg.item.emoji : '🔒'}
                    </span>
                    <span className="bg-white px-2 py-1.5">
                      <span className="block text-sm font-bold leading-tight">{bg.item.name}</span>
                      <span className="block text-[11px] text-ink/60">
                        {current
                          ? t('room.current')
                          : bg.owned
                            ? t('room.use')
                            : bg.unlock[0]
                              ? unlockText(bg.unlock[0])
                              : t('room.locked')}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="sticky bottom-24 z-30 flex gap-2">
        <Button variant="secondary" block onClick={onClose} disabled={save.isPending}>
          {t('room.cancel')}
        </Button>
        <Button block onClick={() => save.mutate()} loading={save.isPending}>
          ✅ {t('room.done')}
        </Button>
      </div>
    </div>
  );
}

const FRIENDSHIP_KEYS = [
  'STRANGERS',
  'ACQUAINTANCES',
  'BUDDIES',
  'FRIENDS',
  'BEST_FRIENDS',
] as const;
