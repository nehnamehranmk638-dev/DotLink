import React, { useReducer, useEffect, useRef, useState } from 'react';
import { initMatchPairsState, matchPairsReducer } from './matchPairsReducer';
import { getThemedObject, getTheme } from './assets';
import { playSoftChime, playCalmCelebration } from './sound';
import Companion from './Companion';

/**
 * Game 2: "Match the Numbers" (Match Pairs, Face-Up Variant)
 *
 * 3 numerals on the left, 3 object sets on the right.
 * Face-up representation keeps working memory low.
 * Connects matches via gentle glow and soft line, with calm celebration.
 */
export default function MatchPairsGame({
  config,
  onComplete,
  reduceMotion = false,
  soundEnabled = false
}) {
  const {
    theme: themeKey = 'dinosaurs',
    companion: companionKey = 'barnaby',
    pairs = [
      { id: 'p1', left: { type: 'numeral', value: 3 }, right: { type: 'objects', objectKey: 'dino_egg', count: 3 } },
      { id: 'p2', left: { type: 'numeral', value: 2 }, right: { type: 'objects', objectKey: 'dino_egg', count: 2 } },
      { id: 'p3', left: { type: 'numeral', value: 5 }, right: { type: 'objects', objectKey: 'dino_egg', count: 5 } }
    ],
    voiceLines = {
      intro: "Match the number to the group of items!",
      hint: "Almost! Count the items carefully and try again.",
      assist: "Look at the glowing one! That's the match.",
      success: "Every number found its match! You did it!"
    }
  } = config || {};

  const theme = getTheme(themeKey);

  const [state, dispatch] = useReducer(
    matchPairsReducer,
    { pairs, voiceLines },
    () => initMatchPairsState(pairs, voiceLines)
  );

  const stallTimerRef = useRef(null);
  const leftRefs = useRef({});
  const rightRefs = useRef({});
  const boardRef = useRef(null);

  // Measure connector lines coordinates
  const [lineCoords, setLineCoords] = useState([]);

  // Calculate coordinates for SVG connecting lines between matched items
  const updateConnectorLines = () => {
    if (!boardRef.current) return;
    const boardRect = boardRef.current.getBoundingClientRect();
    const newCoords = [];

    state.matchedPairIds.forEach((pairId) => {
      const leftEl = leftRefs.current[pairId];
      const rightEl = rightRefs.current[pairId];
      if (leftEl && rightEl) {
        const lRect = leftEl.getBoundingClientRect();
        const rRect = rightEl.getBoundingClientRect();

        newCoords.push({
          id: pairId,
          x1: lRect.right - boardRect.left,
          y1: lRect.top + lRect.height / 2 - boardRect.top,
          x2: rRect.left - boardRect.left,
          y2: rRect.top + rRect.height / 2 - boardRect.top
        });
      }
    });

    setLineCoords(newCoords);
  };

  useEffect(() => {
    updateConnectorLines();
    window.addEventListener('resize', updateConnectorLines);
    return () => window.removeEventListener('resize', updateConnectorLines);
  }, [state.matchedPairIds]);

  // Soft internal 30-second cap timer
  useEffect(() => {
    stallTimerRef.current = setTimeout(() => {
      if (state.phase === 'matching') {
        dispatch({ type: 'AUTO_FINISH', payload: { voiceLines } });
      }
    }, 28000);

    return () => {
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    };
  }, [state.phase, voiceLines]);

  // Handle Celebration & Completion
  useEffect(() => {
    if (state.phase === 'celebration') {
      playCalmCelebration(soundEnabled);
      const timer = setTimeout(() => {
        dispatch({ type: 'COMPLETE_GAME' });
        if (onComplete) {
          const durationMs = Date.now() - state.startTime;
          onComplete({
            gameType: 'match_pairs',
            assisted: state.assisted,
            interactions: state.interactions,
            misplacements: state.mismatches,
            durationMs
          });
        }
      }, 1400);

      return () => clearTimeout(timer);
    }
  }, [state.phase, soundEnabled, onComplete, state.assisted, state.interactions, state.mismatches, state.startTime]);

  const handleLeftClick = (id) => {
    dispatch({ type: 'SELECT_LEFT', payload: { id, voiceLines } });
  };

  const handleRightClick = (id) => {
    dispatch({ type: 'SELECT_RIGHT', payload: { id, voiceLines } });
  };

  // Keyboard accessibility
  const handleLeftKeyDown = (e, id) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleLeftClick(id);
    }
  };

  const handleRightKeyDown = (e, id) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleRightClick(id);
    }
  };

  return (
    <div
      className="flex flex-col gap-6 max-w-4xl mx-auto w-full select-none"
      style={{
        fontFamily: "'Lexend', 'Atkinson Hyperlegible', sans-serif",
        color: '#2d3436'
      }}
    >
      {/* Companion Header */}
      <Companion
        companionKey={companionKey}
        mood={state.companionMood}
        speechText={state.speechText}
        reduceMotion={reduceMotion}
        soundEnabled={soundEnabled}
      />

      {/* Main Game Board */}
      <div
        ref={boardRef}
        className="relative bg-white/90 backdrop-blur-md rounded-3xl p-6 sm:p-8 shadow-xl border-4 overflow-hidden"
        style={{ borderColor: theme.border }}
      >
        {/* SVG Connector Overlay for Matched Lines */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
          aria-hidden="true"
        >
          {lineCoords.map((line) => (
            <line
              key={line.id}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={theme.accent}
              strokeWidth="5"
              strokeDasharray={reduceMotion ? 'none' : '8 4'}
              strokeLinecap="round"
              className={reduceMotion ? '' : 'animate-pulse'}
              opacity="0.85"
            />
          ))}
        </svg>

        <div className="grid grid-cols-2 gap-8 sm:gap-14 relative z-20">
          {/* LEFT COLUMN: NUMERALS */}
          <div className="flex flex-col gap-4">
            <div className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-gray-400 mb-1 px-1">
              Numbers
            </div>

            {state.leftItems.map((item) => {
              const isMatched = state.matchedPairIds.includes(item.id);
              const isSelected = state.selectedLeftId === item.id;
              const isPulsing = state.pulsingPairId === item.id;
              const isShaking = state.shakingItemId === item.id;

              return (
                <div
                  key={`left-${item.id}`}
                  ref={(el) => (leftRefs.current[item.id] = el)}
                  role="button"
                  tabIndex={isMatched ? -1 : 0}
                  aria-label={`Number ${item.value}${isMatched ? ', matched' : ''}`}
                  onClick={() => handleLeftClick(item.id)}
                  onKeyDown={(e) => handleLeftKeyDown(e, item.id)}
                  className={`relative flex items-center justify-center p-4 sm:p-6 rounded-2xl border-3 cursor-pointer transition-all min-h-[90px] sm:min-h-[110px] ${
                    isMatched
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-800 opacity-90 shadow-sm'
                      : isSelected
                      ? 'bg-indigo-50 border-indigo-500 ring-4 ring-indigo-200 -translate-y-1'
                      : isPulsing
                      ? 'border-amber-400 ring-4 ring-amber-200 animate-pulse bg-amber-50'
                      : isShaking && !reduceMotion
                      ? 'border-amber-300 animate-shake'
                      : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md'
                  }`}
                  style={{
                    borderColor: isSelected ? theme.accent : undefined,
                    transition: reduceMotion ? 'none' : 'transform 0.2s, box-shadow 0.2s'
                  }}
                >
                  <span className="text-3xl sm:text-5xl font-black text-gray-800">
                    {item.value}
                  </span>
                  {isMatched && (
                    <span className="absolute top-2 right-2 text-emerald-600 font-extrabold text-sm">
                      ✓
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* RIGHT COLUMN: THEMED OBJECT GROUPS */}
          <div className="flex flex-col gap-4">
            <div className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-gray-400 mb-1 px-1">
              Groups
            </div>

            {state.rightItems.map((item) => {
              const isMatched = state.matchedPairIds.includes(item.id);
              const isSelected = state.selectedRightId === item.id;
              const isPulsing = state.pulsingPairId === item.id;
              const isShaking = state.shakingItemId === item.id;
              const themedObj = getThemedObject(item.objectKey);

              return (
                <div
                  key={`right-${item.id}`}
                  ref={(el) => (rightRefs.current[item.id] = el)}
                  role="button"
                  tabIndex={isMatched ? -1 : 0}
                  aria-label={`Group of ${item.count} ${themedObj.plural}${isMatched ? ', matched' : ''}`}
                  onClick={() => handleRightClick(item.id)}
                  onKeyDown={(e) => handleRightKeyDown(e, item.id)}
                  className={`relative flex items-center justify-center p-4 sm:p-6 rounded-2xl border-3 cursor-pointer transition-all min-h-[90px] sm:min-h-[110px] ${
                    isMatched
                      ? 'bg-emerald-50 border-emerald-400 text-emerald-800 opacity-90 shadow-sm'
                      : isSelected
                      ? 'bg-indigo-50 border-indigo-500 ring-4 ring-indigo-200 -translate-y-1'
                      : isPulsing
                      ? 'border-amber-400 ring-4 ring-amber-200 animate-pulse bg-amber-50'
                      : isShaking && !reduceMotion
                      ? 'border-amber-300 animate-shake'
                      : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md'
                  }`}
                  style={{
                    borderColor: isSelected ? theme.accent : undefined,
                    transition: reduceMotion ? 'none' : 'transform 0.2s, box-shadow 0.2s'
                  }}
                >
                  {/* Object Group Grid */}
                  <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 max-w-[200px]">
                    {Array.from({ length: item.count }).map((_, i) => (
                      <span
                        key={`obj-${item.id}-${i}`}
                        style={{ fontSize: 'clamp(24px, 3.5vw, 32px)' }}
                        role="img"
                        aria-hidden="true"
                      >
                        {themedObj.emoji}
                      </span>
                    ))}
                  </div>
                  {isMatched && (
                    <span className="absolute top-2 right-2 text-emerald-600 font-extrabold text-sm">
                      ✓
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Celebration Banner */}
        {state.phase === 'celebration' && (
          <div className="mt-8 py-3 px-6 rounded-2xl bg-emerald-100 text-emerald-800 text-center font-black text-xl animate-scaleUp">
            🎉 Great job! All pairs matched!
          </div>
        )}
      </div>
    </div>
  );
}
