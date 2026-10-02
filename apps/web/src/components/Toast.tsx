'use client';

import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastTone = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}

const ToastContext = createContext<(text: string, tone?: ToastTone) => void>(() => undefined);

/** Messages courts et non bloquants, annoncés aux lecteurs d'écran (aria-live). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 3_800);
  }, []);
  const tones: Record<ToastTone, string> = {
    info: 'bg-ink text-white',
    success: 'bg-mint text-white',
    error: 'bg-coral text-white',
  };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4"
      >
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: -16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              className={`max-w-md rounded-2xl px-4 py-3 text-center font-semibold shadow-lg ${tones[item.tone]}`}
            >
              {item.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
