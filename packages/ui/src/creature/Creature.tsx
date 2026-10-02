'use client';

import type { AccessorySlot, Appearance, FormFeature, Mood } from '@mimo/types';
import { motion, useReducedMotion } from 'motion/react';
import { useId, type ReactNode } from 'react';

export type CreatureReaction = 'idle' | 'happy' | 'eat' | 'levelup' | 'sleep';

export interface CreatureProps {
  appearance: Appearance;
  /** Emojis des accessoires équipés, par emplacement. */
  equipment?: Partial<Record<AccessorySlot, string>>;
  mood?: Mood;
  reaction?: CreatureReaction;
  /** Clé qui change à chaque réaction pour rejouer l'animation. */
  reactionKey?: number | string;
  size?: number;
  label: string;
  animated?: boolean;
  className?: string;
}

const STAGE_SCALE = { EGG: 1, BABY: 0.74, YOUNG: 0.88, ADULT: 1, SPECIAL: 1.06 } as const;

/**
 * Créature dessinée en SVG (aucun asset requis). Chaque espèce a sa silhouette,
 * le stade change la taille, la branche d'évolution ajoute un attribut distinctif,
 * les formes spéciales ont une aura animée.
 */
export function Creature({
  appearance,
  equipment = {},
  mood = 'happy',
  reaction = 'idle',
  reactionKey,
  size = 220,
  label,
  animated = true,
  className,
}: CreatureProps) {
  const uid = useId().replace(/:/g, '');
  const reduce = useReducedMotion();
  const move = animated && !reduce;
  const { species, stage, palette } = appearance;
  const scale = STAGE_SCALE[stage];
  const floating = species === 'spirit';
  const sleeping = mood === 'sleepy' || reaction === 'sleep';

  const reactionAnimation =
    reaction === 'happy' || reaction === 'levelup'
      ? { y: [0, -26, 0, -12, 0], rotate: [0, -4, 4, -2, 0] }
      : reaction === 'eat'
        ? { scaleY: [1, 0.92, 1.04, 0.96, 1], scaleX: [1, 1.06, 0.97, 1.03, 1] }
        : {};

  return (
    <svg
      viewBox="0 0 200 220"
      width={size}
      height={(size * 220) / 200}
      role="img"
      aria-label={label}
      className={className}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <radialGradient id={`aura-${uid}`}>
          <stop offset="0%" stopColor={appearance.aura ?? palette.accent} stopOpacity="0.55" />
          <stop offset="70%" stopColor={appearance.aura ?? palette.accent} stopOpacity="0.15" />
          <stop offset="100%" stopColor={appearance.aura ?? palette.accent} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`body-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lighten(palette.body, 0.18)} />
          <stop offset="100%" stopColor={palette.body} />
        </linearGradient>
        <linearGradient id={`metal-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={lighten(palette.body, 0.35)} />
          <stop offset="55%" stopColor={palette.body} />
          <stop offset="100%" stopColor={darken(palette.body, 0.15)} />
        </linearGradient>
      </defs>

      {/* Ombre au sol */}
      <motion.ellipse
        cx="100"
        cy="204"
        rx={floating ? 30 : 46 * scale}
        ry="7"
        fill="#2d2a3e"
        opacity="0.12"
        animate={move && floating ? { rx: [30, 24, 30], opacity: [0.12, 0.07, 0.12] } : undefined}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      />

      {appearance.aura && (
        <motion.circle
          cx="100"
          cy="125"
          r="98"
          fill={`url(#aura-${uid})`}
          animate={move ? { scale: [0.92, 1.05, 0.92], opacity: [0.8, 1, 0.8] } : undefined}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: '100px 125px' }}
        />
      )}

      <motion.g
        animate={move ? { y: floating ? [0, -10, 0] : [0, -4, 0] } : undefined}
        transition={{ duration: floating ? 3 : 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <motion.g
          key={reactionKey}
          animate={move ? reactionAnimation : undefined}
          transition={{ duration: 0.9, ease: 'easeOut' }}
          style={{ transformOrigin: '100px 200px' }}
        >
          <g transform={`translate(100 200) scale(${scale}) translate(-100 -200)`}>
            {stage === 'EGG' ? (
              <Egg species={species} palette={palette} uid={uid} move={move} />
            ) : (
              <>
                {equipment.BACK && <Accessory emoji={equipment.BACK} x={146} y={112} size={40} />}
                <Body
                  species={species}
                  palette={palette}
                  uid={uid}
                  feature={appearance.feature}
                  move={move}
                />
                <Face
                  species={species}
                  palette={palette}
                  mood={mood}
                  sleeping={sleeping}
                  eating={reaction === 'eat'}
                  move={move}
                />
                <Feature
                  feature={appearance.feature}
                  palette={palette}
                  species={species}
                  move={move}
                />
                {equipment.NECK && <Accessory emoji={equipment.NECK} x={100} y={170} size={28} />}
                {equipment.FACE && <Accessory emoji={equipment.FACE} x={100} y={121} size={44} />}
                {equipment.HEAD && (
                  <Accessory
                    emoji={equipment.HEAD}
                    x={100}
                    y={species === 'robot' ? 62 : 68}
                    size={44}
                  />
                )}
              </>
            )}
          </g>
        </motion.g>
      </motion.g>

      {reaction === 'levelup' && move && (
        <Sparkles key={`s-${reactionKey}`} color={palette.accent} />
      )}
      {sleeping && stage !== 'EGG' && <Zzz move={move} />}
    </svg>
  );
}

// ─── Morceaux du dessin ──────────────────────────────────────────────────────

interface PartProps {
  species: string;
  palette: Appearance['palette'];
  uid: string;
  move: boolean;
}

function Egg({ species, palette, uid, move }: PartProps) {
  const egg =
    'M100 60 C140 60 158 112 158 145 C158 180 132 200 100 200 C68 200 42 180 42 145 C42 112 60 60 100 60 Z';
  const fill = species === 'robot' ? `url(#metal-${uid})` : `url(#body-${uid})`;
  return (
    <motion.g
      animate={move ? { rotate: [0, -5, 5, -3, 0, 0, 0] } : undefined}
      transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
      style={{ transformOrigin: '100px 195px' }}
    >
      <path d={egg} fill={fill} stroke={darken(palette.body, 0.25)} strokeWidth="3" />
      <clipPath id={`egg-${uid}`}>
        <path d={egg} />
      </clipPath>
      <g clipPath={`url(#egg-${uid})`}>
        {species === 'dragon' &&
          [0, 1, 2, 3, 4].map((i) => (
            <path
              key={i}
              d={`M${50 + i * 25} 150 l12 -18 l12 18 Z`}
              fill={palette.accent}
              opacity="0.75"
            />
          ))}
        {species === 'fox' && (
          <path
            d="M42 160 C80 130 120 190 158 150 L158 210 L42 210 Z"
            fill={palette.belly}
            opacity="0.9"
          />
        )}
        {species === 'dino' &&
          [
            [75, 100, 9],
            [122, 120, 12],
            [88, 160, 10],
            [130, 172, 7],
            [64, 140, 6],
          ].map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={palette.accent} opacity="0.8" />
          ))}
        {species === 'robot' && (
          <>
            <rect x="42" y="132" width="116" height="10" fill={darken(palette.body, 0.2)} />
            {[60, 100, 140].map((x) => (
              <circle key={x} cx={x} cy="137" r="3" fill="#ffffff" opacity="0.8" />
            ))}
            <motion.circle
              cx="100"
              cy="98"
              r="9"
              fill={palette.accent}
              animate={move ? { opacity: [1, 0.35, 1] } : undefined}
              transition={{ duration: 1.4, repeat: Infinity }}
            />
          </>
        )}
        {species === 'spirit' && (
          <>
            <circle cx="80" cy="105" r="30" fill="#ffffff" opacity="0.35" />
            <Star x={120} y={150} r={8} color="#ffffff" />
            <Star x={78} y={165} r={5} color={palette.accent} />
          </>
        )}
      </g>
      <path
        d="M86 92 l8 10 l-6 8 l9 9"
        fill="none"
        stroke={darken(palette.body, 0.35)}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <ellipse cx="82" cy="95" rx="10" ry="16" fill="#ffffff" opacity="0.35" />
    </motion.g>
  );
}

function Body({ species, palette, uid, feature, move }: PartProps & { feature: FormFeature }) {
  const fill = `url(#body-${uid})`;
  const outline = darken(palette.body, 0.28);
  switch (species) {
    case 'dragon':
      return (
        <g>
          <motion.g
            animate={move ? { rotate: [0, -8, 0] } : undefined}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: '62px 120px' }}
          >
            <path
              d="M62 120 C30 90 18 110 22 128 C34 122 40 134 50 130 C46 142 58 146 62 138 Z"
              fill={palette.accent}
              stroke={outline}
              strokeWidth="2.5"
            />
          </motion.g>
          <motion.g
            animate={move ? { rotate: [0, 8, 0] } : undefined}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: '138px 120px' }}
          >
            <path
              d="M138 120 C170 90 182 110 178 128 C166 122 160 134 150 130 C154 142 142 146 138 138 Z"
              fill={palette.accent}
              stroke={outline}
              strokeWidth="2.5"
            />
          </motion.g>
          <path
            d="M140 178 C170 182 178 160 172 146 L184 150 L176 136 C186 168 168 196 136 190 Z"
            fill={fill}
            stroke={outline}
            strokeWidth="2.5"
          />
          <ellipse cx="100" cy="135" rx="56" ry="60" fill={fill} stroke={outline} strokeWidth="3" />
          <ellipse cx="100" cy="152" rx="34" ry="36" fill={palette.belly} />
          {[140, 152, 164].map((y) => (
            <path
              key={y}
              d={`M78 ${y} Q100 ${y + 6} 122 ${y}`}
              stroke={darken(palette.belly, 0.12)}
              strokeWidth="2"
              fill="none"
            />
          ))}
          <path
            d="M76 82 L70 60 L88 76 Z"
            fill={palette.accent}
            stroke={outline}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M124 82 L130 60 L112 76 Z"
            fill={palette.accent}
            stroke={outline}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <Feet color={darken(palette.body, 0.1)} outline={outline} />
        </g>
      );
    case 'fox':
      return (
        <g>
          {feature === 'tails' ? (
            <NineTails palette={palette} />
          ) : (
            <motion.g
              animate={move ? { rotate: [0, 6, 0] } : undefined}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              style={{ transformOrigin: '140px 180px' }}
            >
              <path
                d="M138 182 C190 190 196 120 168 104 C172 140 160 160 132 166 Z"
                fill={fill}
                stroke={outline}
                strokeWidth="2.5"
              />
              <path
                d="M168 104 C178 114 182 128 180 140 C172 132 166 118 168 104 Z"
                fill={palette.belly}
              />
            </motion.g>
          )}
          <path
            d="M62 96 L58 48 L96 80 Z"
            fill={fill}
            stroke={outline}
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path
            d="M138 96 L142 48 L104 80 Z"
            fill={fill}
            stroke={outline}
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path d="M66 88 L64 62 L84 80 Z" fill={palette.accent} opacity="0.8" />
          <path d="M134 88 L136 62 L116 80 Z" fill={palette.accent} opacity="0.8" />
          <ellipse cx="100" cy="135" rx="56" ry="60" fill={fill} stroke={outline} strokeWidth="3" />
          <path d="M60 128 C72 160 128 160 140 128 C132 170 68 170 60 128 Z" fill={palette.belly} />
          <ellipse cx="100" cy="166" rx="28" ry="24" fill={palette.belly} />
          <Feet color={palette.accent} outline={outline} />
        </g>
      );
    case 'dino':
      return (
        <g>
          <path
            d="M60 176 C30 182 18 168 14 150 C34 164 46 160 62 156 Z"
            fill={fill}
            stroke={outline}
            strokeWidth="2.5"
          />
          {(
            [
              [70, 88],
              [90, 76],
              [112, 76],
              [132, 88],
              [148, 108],
            ] as const
          ).map(([x, y]) => (
            <path
              key={`${x}-${y}`}
              d={`M${x - 10} ${y + 8} L${x} ${y - 12} L${x + 10} ${y + 8} Z`}
              fill={palette.accent}
              stroke={outline}
              strokeWidth="2"
              strokeLinejoin="round"
            />
          ))}
          <ellipse cx="100" cy="136" rx="58" ry="58" fill={fill} stroke={outline} strokeWidth="3" />
          <ellipse cx="100" cy="156" rx="36" ry="32" fill={palette.belly} />
          {[
            [62, 116, 6],
            [140, 128, 5],
            [134, 104, 4],
          ].map(([cx, cy, r]) => (
            <circle
              key={`${cx}`}
              cx={cx}
              cy={cy}
              r={r}
              fill={darken(palette.body, 0.15)}
              opacity="0.5"
            />
          ))}
          <Feet color={darken(palette.body, 0.12)} outline={outline} />
        </g>
      );
    case 'robot':
      return (
        <g>
          <line
            x1="100"
            y1="72"
            x2="100"
            y2="50"
            stroke={outline}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <motion.circle
            cx="100"
            cy="46"
            r="8"
            fill={palette.accent}
            stroke={outline}
            strokeWidth="2.5"
            animate={move ? { opacity: [1, 0.4, 1] } : undefined}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          <rect
            x="34"
            y="128"
            width="16"
            height="34"
            rx="8"
            fill={`url(#metal-${uid})`}
            stroke={outline}
            strokeWidth="2.5"
          />
          <rect
            x="150"
            y="128"
            width="16"
            height="34"
            rx="8"
            fill={`url(#metal-${uid})`}
            stroke={outline}
            strokeWidth="2.5"
          />
          <rect
            x="46"
            y="72"
            width="108"
            height="122"
            rx="30"
            fill={`url(#metal-${uid})`}
            stroke={outline}
            strokeWidth="3"
          />
          <rect x="60" y="92" width="80" height="56" rx="18" fill="#2d2a3e" />
          <rect
            x="74"
            y="160"
            width="52"
            height="20"
            rx="8"
            fill={palette.belly}
            stroke={outline}
            strokeWidth="2"
          />
          {[84, 100, 116].map((x) => (
            <circle key={x} cx={x} cy="170" r="3.5" fill={palette.accent} />
          ))}
          <circle cx="54" cy="84" r="3" fill={outline} />
          <circle cx="146" cy="84" r="3" fill={outline} />
          <rect x="64" y="192" width="22" height="12" rx="5" fill={darken(palette.body, 0.25)} />
          <rect x="114" y="192" width="22" height="12" rx="5" fill={darken(palette.body, 0.25)} />
        </g>
      );
    default:
      // Esprit mystique : silhouette flottante aux bords ondulés.
      return (
        <g>
          <path
            d="M100 66 C146 66 158 104 158 140 L158 186 C150 178 142 194 132 184 C124 196 114 182 106 194 C98 182 88 196 80 184 C70 194 60 178 50 188 L42 140 C42 104 54 66 100 66 Z"
            fill={fill}
            stroke={outline}
            strokeWidth="3"
            opacity="0.95"
          />
          <ellipse cx="100" cy="146" rx="32" ry="30" fill={palette.belly} opacity="0.75" />
          <ellipse cx="78" cy="92" rx="12" ry="8" fill="#ffffff" opacity="0.35" />
          <Twinkle x={34} y={86} color={palette.accent} move={move} delay={0} />
          <Twinkle x={170} y={74} color="#ffffff" move={move} delay={0.7} />
          <Twinkle x={166} y={160} color={palette.accent} move={move} delay={1.3} />
        </g>
      );
  }
}

function Face({
  species,
  palette,
  mood,
  sleeping,
  eating,
  move,
}: {
  species: string;
  palette: Appearance['palette'];
  mood: Mood;
  sleeping: boolean;
  eating: boolean;
  move: boolean;
}) {
  const robot = species === 'robot';
  const eyeY = robot ? 116 : 120;
  const ink = robot ? palette.accent : '#2d2a3e';
  const mouthY = robot ? 136 : 142;

  const eyes = sleeping ? (
    <g stroke={ink} strokeWidth="4" strokeLinecap="round" fill="none">
      <path d={`M72 ${eyeY} q10 8 20 0`} />
      <path d={`M108 ${eyeY} q10 8 20 0`} />
    </g>
  ) : robot ? (
    <g fill={palette.accent}>
      <rect x="72" y={eyeY - 10} width="18" height="20" rx="6" />
      <rect x="110" y={eyeY - 10} width="18" height="20" rx="6" />
    </g>
  ) : (
    <g>
      {[82, 118].map((cx) => (
        <g key={cx}>
          <ellipse cx={cx} cy={eyeY} rx="11" ry="13" fill="#2d2a3e" />
          <circle cx={cx + 4} cy={eyeY - 5} r="4.5" fill="#ffffff" />
          <circle cx={cx - 3} cy={eyeY + 5} r="2" fill="#ffffff" opacity="0.8" />
        </g>
      ))}
    </g>
  );

  const mouth = eating ? (
    <ellipse cx="100" cy={mouthY + 2} rx="8" ry="9" fill={robot ? palette.accent : '#7a3b3b'} />
  ) : mood === 'radiant' ? (
    <path
      d={`M86 ${mouthY - 2} Q100 ${mouthY + 18} 114 ${mouthY - 2} Z`}
      fill={robot ? palette.accent : '#7a3b3b'}
    />
  ) : (
    <path
      d={`M88 ${mouthY} Q100 ${mouthY + (mood === 'calm' || sleeping ? 6 : 11)} 112 ${mouthY}`}
      stroke={ink}
      strokeWidth="4"
      strokeLinecap="round"
      fill="none"
    />
  );

  return (
    <g>
      {sleeping || !move ? (
        eyes
      ) : (
        <motion.g
          animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
          transition={{ duration: 4.2, repeat: Infinity, times: [0, 0.9, 0.93, 0.96, 1] }}
          style={{ transformOrigin: `100px ${eyeY}px` }}
        >
          {eyes}
        </motion.g>
      )}
      {!robot && (
        <>
          <ellipse cx="66" cy="136" rx="9" ry="5.5" fill="#ff7aa2" opacity="0.45" />
          <ellipse cx="134" cy="136" rx="9" ry="5.5" fill="#ff7aa2" opacity="0.45" />
        </>
      )}
      {species === 'fox' && <ellipse cx="100" cy="132" rx="5" ry="3.5" fill="#2d2a3e" />}
      {mouth}
    </g>
  );
}

function Feature({
  feature,
  palette,
  species,
  move,
}: {
  feature: FormFeature;
  palette: Appearance['palette'];
  species: string;
  move: boolean;
}) {
  const ink = '#2d2a3e';
  const eyeY = species === 'robot' ? 116 : 120;
  switch (feature) {
    case 'glasses':
      return (
        <g fill="none" stroke={ink} strokeWidth="3.5">
          <circle cx="82" cy={eyeY} r="16" />
          <circle cx="118" cy={eyeY} r="16" />
          <path d={`M98 ${eyeY} q2 -4 4 0`} />
        </g>
      );
    case 'scarf':
      return (
        <g>
          <path
            d="M58 162 Q100 184 142 162 L142 174 Q100 196 58 174 Z"
            fill={palette.accent}
            stroke={ink}
            strokeWidth="2"
          />
          <path
            d="M120 178 L130 206 L116 204 L110 182 Z"
            fill={palette.accent}
            stroke={ink}
            strokeWidth="2"
          />
        </g>
      );
    case 'beret':
      return (
        <g>
          <ellipse
            cx="96"
            cy="78"
            rx="38"
            ry="14"
            fill={palette.accent}
            stroke={ink}
            strokeWidth="2.5"
            transform="rotate(-10 96 78)"
          />
          <circle cx="98" cy="64" r="4" fill={ink} />
        </g>
      );
    case 'shield':
      return (
        <g>
          <path
            d="M30 140 L52 132 L74 140 C74 166 62 178 52 184 C42 178 30 166 30 140 Z"
            fill={palette.accent}
            stroke={ink}
            strokeWidth="2.5"
          />
          <Star x={52} y={154} r={8} color="#ffffff" />
        </g>
      );
    case 'headband':
      return (
        <g>
          <path
            d="M50 98 Q100 82 150 98 L150 108 Q100 92 50 108 Z"
            fill={palette.accent}
            stroke={ink}
            strokeWidth="2"
          />
          <path
            d="M150 100 L170 92 L166 108 Z"
            fill={palette.accent}
            stroke={ink}
            strokeWidth="2"
          />
        </g>
      );
    case 'book':
      return (
        <g transform="rotate(-12 150 168)">
          <rect
            x="132"
            y="150"
            width="38"
            height="30"
            rx="4"
            fill={palette.accent}
            stroke={ink}
            strokeWidth="2.5"
          />
          <line x1="151" y1="150" x2="151" y2="180" stroke={ink} strokeWidth="2" />
          <rect x="136" y="156" width="10" height="3" fill="#ffffff" opacity="0.8" />
        </g>
      );
    case 'leaf':
      return (
        <motion.g
          animate={move ? { rotate: [-6, 6, -6] } : undefined}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{ transformOrigin: '100px 78px' }}
        >
          <path
            d="M100 78 C96 58 112 46 128 48 C126 64 114 76 100 78 Z"
            fill="#6cc46c"
            stroke={ink}
            strokeWidth="2"
          />
          <path d="M100 78 L120 54" stroke={ink} strokeWidth="1.5" />
        </motion.g>
      );
    case 'compass':
      return (
        <g>
          <circle cx="146" cy="168" r="15" fill="#fff8e1" stroke={ink} strokeWidth="2.5" />
          <path d="M146 156 L150 168 L146 180 L142 168 Z" fill={palette.accent} />
          <circle cx="146" cy="168" r="2.5" fill={ink} />
        </g>
      );
    case 'gear':
      return (
        <motion.g
          animate={move ? { rotate: 360 } : undefined}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '150px 74px' }}
        >
          <circle
            cx="150"
            cy="74"
            r="13"
            fill={palette.accent}
            stroke={ink}
            strokeWidth="2.5"
            strokeDasharray="6 3"
          />
          <circle cx="150" cy="74" r="5" fill="#ffffff" />
        </motion.g>
      );
    case 'note':
      return (
        <motion.g
          animate={move ? { y: [0, -8, 0], opacity: [1, 0.6, 1] } : undefined}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <text x="150" y="80" fontSize="26" fill={palette.accent} aria-hidden="true">
            ♪
          </text>
          <text x="34" y="96" fontSize="20" fill={palette.accent} aria-hidden="true">
            ♫
          </text>
        </motion.g>
      );
    case 'star':
      return <Star x={100} y={species === 'robot' ? 84 : 94} r={9} color={palette.accent} />;
    case 'moon':
      return (
        <path
          d="M106 80 A12 12 0 1 1 106 104 A9 9 0 1 0 106 80 Z"
          fill={palette.accent}
          stroke={ink}
          strokeWidth="1.5"
        />
      );
    case 'flame':
      return (
        <motion.path
          d="M100 74 C88 62 96 48 100 38 C104 50 116 58 104 74 C102 68 98 68 100 74 Z"
          fill="#ff9f1c"
          stroke="#e85d04"
          strokeWidth="2"
          animate={move ? { scaleY: [1, 1.15, 0.95, 1] } : undefined}
          transition={{ duration: 0.9, repeat: Infinity }}
          style={{ transformOrigin: '100px 74px' }}
        />
      );
    case 'crystal':
      return (
        <g stroke={ink} strokeWidth="2" strokeLinejoin="round">
          <path d="M84 82 L90 56 L98 82 Z" fill={palette.accent} opacity="0.9" />
          <path d="M100 80 L108 46 L116 80 Z" fill="#ffffff" opacity="0.85" />
          <path d="M116 84 L124 64 L130 86 Z" fill={palette.accent} opacity="0.9" />
        </g>
      );
    default:
      return null;
  }
}

/** Queues multiples du Renard aux Neuf Queues, dessinées derrière le corps. */
function NineTails({ palette }: { palette: Appearance['palette'] }) {
  return (
    <g>
      {[-60, -30, 0, 30, 60].map((angle) => (
        <path
          key={angle}
          d="M100 180 C120 150 150 120 160 96 C170 120 150 160 108 186 Z"
          fill={palette.body}
          stroke={darken(palette.body, 0.3)}
          strokeWidth="2"
          transform={`rotate(${angle} 100 184)`}
          opacity="0.9"
        />
      ))}
    </g>
  );
}

function Feet({ color, outline }: { color: string; outline: string }) {
  return (
    <g>
      <ellipse cx="76" cy="192" rx="16" ry="9" fill={color} stroke={outline} strokeWidth="2.5" />
      <ellipse cx="124" cy="192" rx="16" ry="9" fill={color} stroke={outline} strokeWidth="2.5" />
    </g>
  );
}

function Accessory({ emoji, x, y, size }: { emoji: string; x: number; y: number; size: number }) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      textAnchor="middle"
      dominantBaseline="middle"
      aria-hidden="true"
    >
      {emoji}
    </text>
  );
}

function Star({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    return `${x + radius * Math.cos(angle)},${y + radius * Math.sin(angle)}`;
  }).join(' ');
  return (
    <polygon
      points={points}
      fill={color}
      stroke="#2d2a3e"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  );
}

function Twinkle({
  x,
  y,
  color,
  move,
  delay,
}: {
  x: number;
  y: number;
  color: string;
  move: boolean;
  delay: number;
}) {
  return (
    <motion.g
      animate={move ? { scale: [0.6, 1.1, 0.6], opacity: [0.4, 1, 0.4] } : undefined}
      transition={{ duration: 2, repeat: Infinity, delay }}
      style={{ transformOrigin: `${x}px ${y}px` }}
    >
      <path
        d={`M${x} ${y - 8} L${x + 2} ${y - 2} L${x + 8} ${y} L${x + 2} ${y + 2} L${x} ${y + 8} L${x - 2} ${y + 2} L${x - 8} ${y} L${x - 2} ${y - 2} Z`}
        fill={color}
      />
    </motion.g>
  );
}

function Sparkles({ color }: { color: string }) {
  const items: ReactNode[] = [];
  for (let i = 0; i < 10; i += 1) {
    const angle = (Math.PI * 2 * i) / 10;
    items.push(
      <motion.circle
        key={i}
        cx="100"
        cy="120"
        r={i % 2 ? 4 : 6}
        fill={i % 3 === 0 ? '#ffc145' : color}
        initial={{ opacity: 1 }}
        animate={{ cx: 100 + Math.cos(angle) * 95, cy: 120 + Math.sin(angle) * 95, opacity: 0 }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
      />,
    );
  }
  return <g aria-hidden="true">{items}</g>;
}

function Zzz({ move }: { move: boolean }) {
  return (
    <motion.text
      x="148"
      y="70"
      fontSize="22"
      fontWeight="700"
      fill="#7c5cff"
      aria-hidden="true"
      animate={move ? { y: [70, 56, 70], opacity: [0.9, 0.4, 0.9] } : undefined}
      transition={{ duration: 2.4, repeat: Infinity }}
    >
      z z
    </motion.text>
  );
}

// ─── Couleurs ────────────────────────────────────────────────────────────────

function mix(hex: string, target: number, amount: number): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  if (Number.isNaN(n)) return hex;
  const channel = (shift: number) => {
    const c = (n >> shift) & 0xff;
    return Math.round(c + (target - c) * amount);
  };
  return `#${[16, 8, 0].map((s) => channel(s).toString(16).padStart(2, '0')).join('')}`;
}

export const lighten = (hex: string, amount: number) => mix(hex, 255, amount);
export const darken = (hex: string, amount: number) => mix(hex, 0, amount);
