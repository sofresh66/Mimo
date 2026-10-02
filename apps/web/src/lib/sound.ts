'use client';

import { useSyncExternalStore } from 'react';

/**
 * Petits sons synthétisés avec la Web Audio API (aucun fichier audio à télécharger).
 * Désactivables ; la préférence est mémorisée sur l'appareil.
 */
export type SoundName = 'pop' | 'success' | 'levelup' | 'coin' | 'open' | 'error' | 'eat';

const STORAGE_KEY = 'mimo.sound';
const listeners = new Set<() => void>();
let context: AudioContext | null = null;

export function isSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // préférence non mémorisée
  }
  listeners.forEach((l) => l());
}

/** Préférence « sons activés », synchronisée entre composants (et hydratation sûre). */
export function useSoundEnabled(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isSoundEnabled,
    () => true,
  );
}

const NOTES: Record<SoundName, Array<[frequency: number, start: number, duration: number]>> = {
  pop: [[660, 0, 0.08]],
  eat: [
    [300, 0, 0.07],
    [380, 0.09, 0.07],
  ],
  coin: [
    [988, 0, 0.08],
    [1319, 0.08, 0.16],
  ],
  success: [
    [523, 0, 0.12],
    [659, 0.12, 0.12],
    [784, 0.24, 0.2],
  ],
  levelup: [
    [523, 0, 0.1],
    [659, 0.1, 0.1],
    [784, 0.2, 0.1],
    [1047, 0.3, 0.3],
  ],
  open: [
    [392, 0, 0.1],
    [523, 0.1, 0.1],
    [784, 0.2, 0.25],
  ],
  error: [
    [330, 0, 0.12],
    [262, 0.12, 0.16],
  ],
};

export function playSound(name: SoundName): void {
  if (typeof window === 'undefined' || !isSoundEnabled()) return;
  try {
    context ??= new AudioContext();
    const ctx = context;
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    for (const [frequency, start, duration] of NOTES[name]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = name === 'error' ? 'triangle' : 'sine';
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.15, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.05);
    }
  } catch {
    // Audio indisponible : on ignore silencieusement.
  }
}
