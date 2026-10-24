import React, { useEffect, useState } from 'react';
import { getGame } from './gameRegistry';
import { getTheme } from './assets';

/**
 * RemediationGame Component
 *
 * Implements the contract:
 * <RemediationGame config={config} onComplete={fn} reduceMotion={bool} soundEnabled={bool} />
 *
 * Popup Overlay adhering strictly to non-negotiable UX rules:
 * - Dims the background, isolates focus to exactly one task
 * - Minimum 56px touch targets
 * - Lexend typography, min 20px text, 1.6 line height
 * - Theme accent injected as CSS variable `--theme-accent`
 * - Resilient to prefers-reduced-motion and app-level reduceMotion
 */
export default function RemediationGame({
  config,
  onComplete,
  reduceMotion: propReduceMotion,
  soundEnabled: propSoundEnabled
}) {
  // Respect system prefers-reduced-motion or app-level override
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setSystemReduceMotion(mediaQuery.matches);

      const handler = (e) => setSystemReduceMotion(e.matches);
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, []);

  const reduceMotion = propReduceMotion !== undefined ? propReduceMotion : systemReduceMotion;
  const soundEnabled = propSoundEnabled !== undefined ? propSoundEnabled : false;

  const gameType = config?.gameType || 'order_steps';
  const GameComponent = getGame(gameType);
  const theme = getTheme(config?.theme || 'dinosaurs');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Learning Mini-Game"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.72)', // Calming deep dimming overlay
        backdropFilter: reduceMotion ? 'none' : 'blur(8px)',
        WebkitBackdropFilter: reduceMotion ? 'none' : 'blur(8px)',
        '--theme-accent': theme.accent
      }}
    >
      {/* Modal Container */}
      <div
        className="relative w-full max-w-4xl rounded-[36px] p-6 sm:p-10 shadow-2xl border-4 overflow-hidden"
        style={{
          backgroundColor: theme.bgTint,
          borderColor: theme.accent,
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.35)',
          transition: reduceMotion ? 'none' : 'transform 0.25s ease-out, opacity 0.25s ease-out'
        }}
      >
        {/* Render Selected Mini-Game */}
        <GameComponent
          config={config}
          onComplete={onComplete}
          reduceMotion={reduceMotion}
          soundEnabled={soundEnabled}
        />
      </div>
    </div>
  );
}
