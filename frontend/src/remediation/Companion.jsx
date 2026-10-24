import React, { useEffect } from 'react';
import { getCompanion } from './assets';
import { speakLine } from './sound';

/**
 * Reusable Companion Component
 *
 * Displays animated mascot with idle breathing/bobbing, cheering leap,
 * and a high-contrast speech bubble with accessible Lexend typography (min 20px, 1.6 line-height).
 */
export default function Companion({
  companionKey,
  mood = 'idle', // 'idle' | 'cheer' | 'assist' | 'demo'
  speechText = '',
  reduceMotion = false,
  soundEnabled = false,
  className = ''
}) {
  const companion = getCompanion(companionKey);

  // Trigger speech synthesis when speechText changes if sound is enabled
  useEffect(() => {
    if (speechText) {
      speakLine(speechText, soundEnabled);
    }
  }, [speechText, soundEnabled]);

  // Determine animation style based on mood and reduceMotion
  let mascotAnimClass = '';
  if (!reduceMotion) {
    if (mood === 'cheer') {
      mascotAnimClass = 'animate-bounce';
    } else if (mood === 'demo') {
      mascotAnimClass = 'transition-transform duration-300 transform scale-105';
    } else {
      mascotAnimClass = 'animate-pulse';
    }
  }

  return (
    <div
      className={`flex items-start sm:items-center gap-4 ${className}`}
      role="region"
      aria-label={`${companion.name} speaking`}
    >
      {/* Mascot Avatar Container */}
      <div
        className={`flex-shrink-0 relative flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white shadow-md border-4 ${mascotAnimClass}`}
        style={{
          borderColor: companion.accent || '#CCA9EF',
          transition: reduceMotion ? 'none' : 'transform 0.25s ease-out'
        }}
      >
        {companion.svg ? (
          companion.svg('w-14 h-14 sm:w-16 sm:h-16')
        ) : (
          <span style={{ fontSize: '42px' }} role="img" aria-label={companion.name}>
            {companion.emoji || '⭐'}
          </span>
        )}

        {/* Tiny cheer sparkle badge when cheering */}
        {mood === 'cheer' && !reduceMotion && (
          <span
            className="absolute -top-1 -right-1 text-2xl animate-spin"
            style={{ animationDuration: '3s' }}
            role="img"
            aria-hidden="true"
          >
            ✨
          </span>
        )}
      </div>

      {/* High-Contrast Speech Bubble */}
      {speechText && (
        <div
          className="relative flex-1 bg-white rounded-3xl p-4 sm:p-5 shadow-lg border-3 border-gray-100"
          style={{
            minHeight: '64px',
            transition: reduceMotion ? 'none' : 'opacity 0.2s ease-out, transform 0.2s ease-out'
          }}
        >
          {/* Speech bubble pointer notch */}
          <div
            className="absolute top-5 -left-3 w-0 h-0 border-t-8 border-b-8 border-r-12 border-t-transparent border-b-transparent border-r-white"
            aria-hidden="true"
          />

          <p
            className="m-0 text-left font-bold text-gray-800"
            style={{
              fontFamily: "'Lexend', 'Atkinson Hyperlegible', sans-serif",
              fontSize: 'clamp(20px, 2.8vw, 24px)',
              lineHeight: 1.55,
              letterSpacing: '-0.2px'
            }}
          >
            {speechText}
          </p>
        </div>
      )}
    </div>
  );
}
