'use client';

import type { ItemView, RoomLayer, SceneView, SocialEventView, VisitView } from '@mimo/types';
import { Creature, cx } from '@mimo/ui';
import { motion } from 'motion/react';
import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useI18n, type MessageKey } from '@/i18n';
import { socialText } from '@/lib/social';

/** Bornes identiques à celles du serveur : un objet reste toujours visible et attrapable. */
export const ROOM_MIN = 6;
export const ROOM_MAX = 94;
const clamp = (v: number) => Math.round(Math.max(ROOM_MIN, Math.min(ROOM_MAX, v)) * 10) / 10;

export interface ScenePlacement {
  id: string;
  item: ItemView;
  x: number;
  y: number;
  layer: RoomLayer;
  flip: boolean;
}

const SIZE_CLASS = { S: 'text-3xl', M: 'text-[2.6rem]', L: 'text-5xl' } as const;
/** Emplacements des petits éléments d'ambiance du décor (en %). */
const PARTICLE_SPOTS = [
  { x: 10, y: 12 },
  { x: 30, y: 6 },
  { x: 68, y: 10 },
  { x: 88, y: 18 },
  { x: 50, y: 4 },
  { x: 20, y: 30 },
];

/**
 * Espace de la créature, en couches : décor → décorations arrière → créatures →
 * décorations avant → interface. Hors édition, les décorations ne captent jamais le toucher :
 * la créature reste toujours cliquable. En édition, les objets se déplacent au doigt ou à la
 * souris (glisser) et au clavier (flèches).
 */
export function CreatureScene({
  scene,
  layout,
  creature,
  visit,
  label,
  editing = false,
  selectedId = null,
  onSelect,
  onMove,
  overlay,
}: {
  scene: SceneView;
  layout: ScenePlacement[];
  /** La créature du joueur (bouton existant, avec ses réactions). */
  creature: ReactNode;
  visit?: VisitView | null;
  label: string;
  editing?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onMove?: (id: string, x: number, y: number) => void;
  /** Boutons d'interface au-dessus de la scène (ex. « Décorer »). */
  overlay?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; pointerId: number } | null>(null);

  const position = (e: PointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100),
    };
  };

  const decor = (p: ScenePlacement) => {
    const size = SIZE_CLASS[p.item.decor?.size ?? 'M'];
    const style = {
      left: `${p.x}%`,
      top: `${p.y}%`,
      transform: `translate(-50%, -50%) scaleX(${p.flip ? -1 : 1})`,
      zIndex: p.layer === 'front' ? 30 : 10,
    };
    if (!editing) {
      return (
        <span
          key={p.id}
          aria-hidden="true"
          className={cx(
            'pointer-events-none absolute select-none leading-none drop-shadow-sm',
            size,
          )}
          style={style}
        >
          {p.item.emoji}
        </span>
      );
    }
    const selected = p.id === selectedId;
    return (
      <button
        key={p.id}
        type="button"
        data-placement={p.id}
        aria-label={p.item.name}
        aria-pressed={selected}
        className={cx(
          'absolute grid size-14 cursor-grab touch-none select-none place-items-center rounded-2xl leading-none',
          'focus-visible:outline-4 focus-visible:outline-primary/60 active:cursor-grabbing',
          selected ? 'bg-white/70 ring-4 ring-primary' : 'ring-2 ring-white/70 ring-dashed',
          size,
        )}
        style={{ ...style, zIndex: selected ? 35 : style.zIndex }}
        onPointerDown={(e) => {
          try {
            // Le doigt reste « attaché » à l'objet même s'il sort de sa zone.
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Capture indisponible (navigateur ancien, stylet) : le déplacement reste possible.
          }
          drag.current = { id: p.id, pointerId: e.pointerId };
          onSelect?.(p.id);
        }}
        onPointerMove={(e) => {
          if (drag.current?.id !== p.id || drag.current.pointerId !== e.pointerId) return;
          const pos = position(e);
          if (pos) onMove?.(p.id, pos.x, pos.y);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onKeyDown={(e: KeyboardEvent) => {
          const step = e.shiftKey ? 10 : 3;
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          };
          const move = moves[e.key];
          if (!move) return;
          e.preventDefault();
          onMove?.(p.id, clamp(p.x + move[0]), clamp(p.y + move[1]));
        }}
      >
        <span style={{ transform: `scaleX(${p.flip ? -1 : 1})` }}>{p.item.emoji}</span>
      </button>
    );
  };

  return (
    <div
      ref={ref}
      role="group"
      aria-label={label}
      data-testid="creature-scene"
      className={cx(
        'relative h-[300px] w-full overflow-hidden rounded-3xl sm:h-[360px]',
        editing && 'touch-none',
      )}
      style={{ background: `linear-gradient(180deg, ${scene.sky[0]} 0%, ${scene.sky[1]} 70%)` }}
      onPointerDown={(e) => {
        // Toucher le décor (pas un objet) désélectionne.
        if (editing && e.target === e.currentTarget) onSelect?.(null);
      }}
    >
      {/* Couche décor : sol et ambiance. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%] rounded-t-[40%]"
        style={{ background: scene.ground }}
      />
      {scene.particles.length > 0 &&
        PARTICLE_SPOTS.map((spot, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="pointer-events-none absolute select-none text-2xl opacity-60"
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
          >
            {scene.particles[i % scene.particles.length]}
          </span>
        ))}

      {/* Décorations arrière. */}
      {layout.filter((p) => p.layer === 'back').map(decor)}

      {/* Créatures. */}
      <div
        className={cx(
          'absolute bottom-[4%] left-1/2 z-20 -translate-x-1/2',
          editing && 'pointer-events-none opacity-80',
        )}
      >
        {creature}
      </div>
      {visit && <Visitor visit={visit} />}

      {/* Décorations avant (jamais cliquables hors édition). */}
      {layout.filter((p) => p.layer === 'front').map(decor)}

      {/* Interface. */}
      {overlay && (
        <div className="absolute inset-x-2 top-2 z-40 flex justify-end gap-2">{overlay}</div>
      )}
    </div>
  );
}

/** Créature d'un autre membre de la famille, en visite (lecture seule). */
function Visitor({ visit }: { visit: VisitView }) {
  const { t } = useI18n();
  const nearItem = visit.item;
  const x = nearItem ? clamp(nearItem.x + (nearItem.x > 50 ? -16 : 16)) : 80;
  // Réaction à un objet placé (« … adore ta lampe ! »), sinon simple message de visite.
  const reaction: SocialEventView = {
    id: visit.id,
    kind: 'DECOR_REACTION',
    eventKey: visit.eventKey,
    icon: visit.icon,
    outgoing: false,
    friend: { creatureName: visit.visitor.name, ownerName: visit.owner.displayName },
    item: nearItem,
    loot: { coins: 0, items: [] },
    delta: 0,
    level: 0,
    levelKey: 'STRANGERS',
    createdAt: visit.endsAt,
  };
  const bubble = nearItem
    ? socialText(reaction, (key, vars) => t(key as MessageKey, vars))
    : t('friends.visitBubble', { owner: visit.owner.displayName });
  return (
    <motion.div
      className="pointer-events-none absolute bottom-[6%] z-20 flex -translate-x-1/2 flex-col items-center"
      style={{ left: `${x}%` }}
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 120, damping: 14 }}
      data-testid="visitor"
    >
      <p
        role="status"
        className="mb-1 max-w-40 rounded-2xl bg-white/95 px-2.5 py-1 text-center text-xs font-semibold text-ink shadow-sm"
      >
        {visit.icon} {bubble}
      </p>
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Creature
          appearance={visit.visitor.appearance}
          size={96}
          reaction="happy"
          label={t('friends.creatureOf', {
            creature: visit.visitor.name,
            owner: visit.owner.displayName,
          })}
        />
      </motion.div>
    </motion.div>
  );
}
