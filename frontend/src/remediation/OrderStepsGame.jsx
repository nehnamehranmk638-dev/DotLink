import React, { useReducer, useEffect, useRef } from 'react';
import { initOrderStepsState, orderStepsReducer } from './orderStepsReducer';
import { getThemedObject, getTheme } from './assets';
import { playSoftChime, playSoftPop, playCalmCelebration } from './sound';
import Companion from './Companion';

/**
 * Game 1: "Companion's Secret Steps" (Order the Steps)
 *
 * Child orders 3 large picture cards into numbered slots (1, 2, 3) via drag-and-drop
 * OR tap-to-select then tap-to-place.
 * After placing all cards, plays an animated demonstration using the child's actual math problem numbers.
 */
export default function OrderStepsGame({
  config,
  onComplete,
  reduceMotion = false,
  soundEnabled = false
}) {
  const {
    theme: themeKey = 'dinosaurs',
    companion: companionKey = 'barnaby',
    problem = { a: 3, b: 2, op: '+' },
    objectKey = 'dino_egg',
    steps = [
      { id: 'step-1', label: 'Count first group', iconKey: 'dino_egg' },
      { id: 'step-2', label: 'Count second group', iconKey: 'baby_dino' },
      { id: 'step-3', label: 'Count them all together', iconKey: 'star' }
    ],
    voiceLines = {
      intro: "Let's put the steps in order!",
      hint: "Almost! Let's see which step happens first.",
      assist: "I'll help place this one right here! You've got this.",
      success: "You solved it! That's how we do it!"
    }
  } = config || {};

  const theme = getTheme(themeKey);
  const themedObj = getThemedObject(objectKey);

  const [state, dispatch] = useReducer(
    orderStepsReducer,
    { steps, voiceLines },
    () => initOrderStepsState(steps, voiceLines)
  );

  const draggedCardIdRef = useRef(null);
  const stallTimerRef = useRef(null);
  const demoIntervalRef = useRef(null);

  // Soft internal 30-second cap timer (or 10s of complete inactivity)
  useEffect(() => {
    stallTimerRef.current = setTimeout(() => {
      if (state.phase === 'ordering') {
        dispatch({ type: 'AUTO_FINISH', payload: { voiceLines } });
      }
    }, 28000);

    return () => {
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    };
  }, [state.phase, voiceLines]);

  // Handle Demonstration Steps & Audio
  useEffect(() => {
    if (state.phase === 'demonstration') {
      let stepCount = 0;
      demoIntervalRef.current = setInterval(() => {
        stepCount += 1;
        playSoftPop(soundEnabled, 1.0 + stepCount * 0.15);
        dispatch({ type: 'ADVANCE_DEMO' });

        if (stepCount >= 4) {
          clearInterval(demoIntervalRef.current);
        }
      }, 950);

      return () => {
        if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
      };
    } else if (state.phase === 'celebration') {
      playCalmCelebration(soundEnabled);
      const timer = setTimeout(() => {
        dispatch({ type: 'COMPLETE_GAME' });
        if (onComplete) {
          const durationMs = Date.now() - state.startTime;
          onComplete({
            gameType: 'order_steps',
            assisted: state.assisted,
            interactions: state.interactions,
            misplacements: state.misplacements,
            durationMs
          });
        }
      }, 1600);

      return () => clearTimeout(timer);
    }
  }, [state.phase, soundEnabled, onComplete, state.assisted, state.interactions, state.misplacements, state.startTime]);

  // Sound cue on successful card placement
  useEffect(() => {
    if (state.justPlacedCardId) {
      playSoftChime(soundEnabled);
    }
  }, [state.justPlacedCardId, soundEnabled]);

  // Pointer & Drag Handlers
  const handleDragStart = (e, cardId) => {
    draggedCardIdRef.current = cardId;
    e.dataTransfer.setData('text/plain', cardId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, slotIndex) => {
    e.preventDefault();
    const cardId = draggedCardIdRef.current || e.dataTransfer.getData('text/plain');
    if (cardId) {
      dispatch({
        type: 'PLACE_CARD',
        payload: { cardId, slotIndex, voiceLines }
      });
      draggedCardIdRef.current = null;
    }
  };

  // Tap-to-Place Handlers
  const handleCardTap = (cardId) => {
    dispatch({ type: 'SELECT_CARD', payload: { cardId } });
  };

  const handleSlotTap = (slotIndex) => {
    if (state.selectedCardId) {
      dispatch({
        type: 'PLACE_CARD',
        payload: { cardId: state.selectedCardId, slotIndex, voiceLines }
      });
    }
  };

  // Keyboard accessibility
  const handleCardKeyDown = (e, cardId) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardTap(cardId);
    }
  };

  const handleSlotKeyDown = (e, slotIndex) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSlotTap(slotIndex);
    }
  };

  // Calculate concrete math demonstration details
  const a = Math.max(1, problem.a || 3);
  const b = Math.max(1, problem.b || 2);
  const op = problem.op === '-' ? '-' : '+';
  const total = op === '+' ? a + b : Math.max(0, a - b);

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
        className="bg-white/90 backdrop-blur-md rounded-3xl p-6 sm:p-8 shadow-xl border-4"
        style={{ borderColor: theme.border }}
      >
        {state.phase === 'ordering' && (
          <div className="flex flex-col gap-8">
            {/* TARGET SLOTS (1, 2, 3) */}
            <div>
              <div className="flex items-center justify-between mb-3 px-2">
                <span className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-gray-400">
                  Step Order
                </span>
                <span className="text-sm font-semibold text-gray-500">
                  {state.selectedCardId ? '👇 Tap a numbered slot to place card' : 'Drag or tap cards into 1, 2, 3'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[0, 1, 2].map((slotIndex) => {
                  const cardInSlot = state.slots[slotIndex];
                  const isTarget = state.selectedCardId && !cardInSlot;

                  return (
                    <div
                      key={`slot-${slotIndex}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`Slot ${slotIndex + 1}${cardInSlot ? `: contains ${cardInSlot.label}` : ', empty'}`}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, slotIndex)}
                      onClick={() => handleSlotTap(slotIndex)}
                      onKeyDown={(e) => handleSlotKeyDown(e, slotIndex)}
                      className={`relative flex flex-col items-center justify-center min-h-[140px] sm:min-h-[170px] rounded-2xl border-3 border-dashed transition-all cursor-pointer p-4 ${
                        isTarget
                          ? 'border-indigo-400 bg-indigo-50/70 scale-102 ring-4 ring-indigo-200'
                          : cardInSlot
                          ? 'border-solid border-emerald-400 bg-emerald-50/50 shadow-md'
                          : 'border-gray-300 bg-gray-50/80 hover:border-gray-400'
                      }`}
                      style={{
                        transition: reduceMotion ? 'none' : 'all 0.25s ease-out'
                      }}
                    >
                      {/* Slot Number Badge */}
                      <div
                        className="absolute top-2 left-3 flex items-center justify-center w-8 h-8 rounded-full font-black text-sm text-white shadow-sm"
                        style={{ backgroundColor: cardInSlot ? '#10b981' : theme.accent }}
                      >
                        {slotIndex + 1}
                      </div>

                      {cardInSlot ? (
                        <div className="flex flex-col items-center text-center mt-2 animate-fadeIn">
                          <span style={{ fontSize: '38px' }} role="img" aria-label={cardInSlot.label}>
                            {getThemedObject(cardInSlot.iconKey || objectKey).emoji}
                          </span>
                          <span className="font-bold text-gray-800 text-lg mt-2 leading-tight">
                            {cardInSlot.label}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 font-bold text-base mt-4">
                          {isTarget ? 'Place here' : `Slot ${slotIndex + 1}`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AVAILABLE CARDS POOL (Shuffled) */}
            <div>
              <div className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-gray-400 mb-3 px-2">
                Cards to Order
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {state.availableCards.map((card) => {
                  const isSelected = state.selectedCardId === card.id;
                  const isShaking = state.shakingCardId === card.id;
                  const isPulsing = state.pulsingCardId === card.id;

                  return (
                    <div
                      key={card.id}
                      role="button"
                      tabIndex={0}
                      draggable
                      aria-label={`Step card: ${card.label}`}
                      onDragStart={(e) => handleDragStart(e, card.id)}
                      onClick={() => handleCardTap(card.id)}
                      onKeyDown={(e) => handleCardKeyDown(e, card.id)}
                      className={`relative flex flex-col items-center justify-center p-5 rounded-2xl bg-white shadow-lg border-3 cursor-grab active:cursor-grabbing transition-all min-h-[140px] sm:min-h-[160px] ${
                        isSelected
                          ? 'border-indigo-500 ring-4 ring-indigo-200 -translate-y-2'
                          : isPulsing
                          ? 'border-amber-400 ring-4 ring-amber-200 animate-pulse'
                          : isShaking && !reduceMotion
                          ? 'border-amber-300 animate-shake'
                          : 'border-gray-200 hover:border-gray-300 hover:-translate-y-1'
                      }`}
                      style={{
                        borderColor: isSelected ? theme.accent : undefined,
                        transition: reduceMotion ? 'none' : 'transform 0.2s, box-shadow 0.2s'
                      }}
                    >
                      <span style={{ fontSize: '42px' }} role="img" aria-label={card.label}>
                        {getThemedObject(card.iconKey || objectKey).emoji}
                      </span>
                      <span className="font-extrabold text-gray-800 text-lg mt-3 text-center leading-snug">
                        {card.label}
                      </span>
                      {isSelected && (
                        <span className="absolute bottom-1 text-xs font-bold text-indigo-600">
                          Selected (Tap a slot)
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* DEMONSTRATION ANIMATION STAGE */}
        {(state.phase === 'demonstration' || state.phase === 'celebration' || state.phase === 'completed') && (
          <div className="flex flex-col items-center justify-center py-6 text-center animate-fadeIn">
            <div className="mb-4">
              <span className="inline-block px-4 py-1.5 rounded-full text-sm font-extrabold text-emerald-800 bg-emerald-100 mb-2">
                Step-by-Step Demonstration
              </span>
              <h3 className="text-2xl sm:text-3xl font-black text-gray-800">
                {op === '+' ? `Adding ${a} and ${b} Together` : `Taking ${b} away from ${a}`}
              </h3>
            </div>

            {/* Visual Object Groups Scene */}
            <div className="flex items-center justify-center gap-6 sm:gap-10 my-6 flex-wrap p-6 rounded-3xl bg-gray-50 border-2 border-gray-200 min-h-[160px] w-full">
              {/* Group A */}
              <div
                className={`flex flex-col items-center p-3 rounded-2xl transition-all ${
                  state.demoStep >= 1 ? 'bg-amber-100/70 scale-105 shadow-sm' : 'opacity-80'
                }`}
              >
                <div className="flex gap-2 text-3xl sm:text-4xl">
                  {Array.from({ length: a }).map((_, i) => (
                    <span
                      key={`a-${i}`}
                      className={`inline-block transition-transform ${
                        state.demoStep >= 1 && !reduceMotion ? 'animate-bounce' : ''
                      }`}
                      style={{ animationDelay: `${i * 120}ms` }}
                    >
                      {themedObj.emoji}
                    </span>
                  ))}
                </div>
                <span className="font-extrabold text-gray-700 mt-2 text-lg">
                  {a} {themedObj.plural}
                </span>
              </div>

              {/* Operator */}
              <div className="text-4xl font-black text-gray-400">
                {op}
              </div>

              {/* Group B */}
              <div
                className={`flex flex-col items-center p-3 rounded-2xl transition-all ${
                  state.demoStep >= 2 ? 'bg-indigo-100/70 scale-105 shadow-sm' : 'opacity-80'
                }`}
              >
                <div className="flex gap-2 text-3xl sm:text-4xl">
                  {Array.from({ length: b }).map((_, i) => (
                    <span
                      key={`b-${i}`}
                      className={`inline-block transition-transform ${
                        state.demoStep >= 2 && !reduceMotion
                          ? op === '-'
                            ? 'opacity-40 line-through scale-90'
                            : 'animate-bounce'
                          : ''
                      }`}
                      style={{ animationDelay: `${i * 120}ms` }}
                    >
                      {themedObj.emoji}
                    </span>
                  ))}
                </div>
                <span className="font-extrabold text-gray-700 mt-2 text-lg">
                  {b} {themedObj.plural}
                </span>
              </div>

              {/* Total Equation Reveal */}
              {state.demoStep >= 3 && (
                <div className="flex items-center gap-4 animate-scaleUp">
                  <span className="text-3xl font-black text-gray-400">=</span>
                  <div
                    className="flex flex-col items-center px-6 py-3 rounded-2xl text-white shadow-lg"
                    style={{ backgroundColor: theme.accent }}
                  >
                    <span className="text-2xl sm:text-3xl font-black">
                      {a} {op} {b} = {total}
                    </span>
                    <span className="text-xs sm:text-sm font-bold opacity-90">
                      Total: {total} {themedObj.plural}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Demonstration Progress Indicator */}
            <div className="flex items-center gap-2 mt-4">
              {[1, 2, 3].map((stepIdx) => (
                <div
                  key={`demo-dot-${stepIdx}`}
                  className="w-3 h-3 rounded-full transition-all"
                  style={{
                    backgroundColor: state.demoStep >= stepIdx ? theme.accent : '#d1d5db',
                    transform: state.demoStep === stepIdx ? 'scale(1.3)' : 'scale(1)'
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
