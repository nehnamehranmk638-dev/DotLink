/**
 * Pure state reducer for Game 1: "Companion's Secret Steps" (Order the Steps)
 *
 * Separates game rules and accessibility logic from React rendering.
 * Enforces positive reinforcement: never marks failure, auto-assists after 2 misplacements,
 * and seamlessly transitions into the concrete number demonstration.
 */

export function initOrderStepsState(steps = [], voiceLines = {}, preShuffledCards = null) {
  // Assign correct slot (0, 1, 2) based on input steps order
  const indexed = steps.map((s, idx) => ({
    ...s,
    correctSlot: idx
  }));

  let shuffled;
  if (preShuffledCards) {
    shuffled = preShuffledCards;
  } else {
    shuffled = [...indexed].sort(() => Math.random() - 0.5);
    // If randomly generated in exact order, swap first two to present a fun shuffle
    if (shuffled.length > 1 && shuffled.every((s, i) => s.correctSlot === i)) {
      const temp = shuffled[0];
      shuffled[0] = shuffled[1];
      shuffled[1] = temp;
    }
  }

  return {
    availableCards: shuffled,
    slots: [null, null, null],
    selectedCardId: null,
    misplacements: 0,
    interactions: 0,
    assisted: false,
    shakingCardId: null,
    pulsingCardId: null,
    justPlacedCardId: null,
    companionMood: 'idle', // 'idle' | 'cheer' | 'assist' | 'demo'
    speechText: voiceLines.intro || "Let's put the steps in order!",
    phase: 'ordering', // 'ordering' | 'demonstration' | 'celebration' | 'completed'
    demoStep: 0,
    totalDemoSteps: 4,
    startTime: Date.now(),
    endTime: null
  };
}

export function orderStepsReducer(state, action) {
  switch (action.type) {
    case 'SELECT_CARD': {
      if (state.phase !== 'ordering') return state;
      // Tapping the already selected card unselects it
      if (state.selectedCardId === action.payload.cardId) {
        return { ...state, selectedCardId: null, shakingCardId: null };
      }
      return {
        ...state,
        selectedCardId: action.payload.cardId,
        shakingCardId: null
      };
    }

    case 'UNSELECT_CARD': {
      return { ...state, selectedCardId: null, shakingCardId: null };
    }

    case 'PLACE_CARD': {
      if (state.phase !== 'ordering') return state;
      const { cardId, slotIndex, voiceLines = {} } = action.payload;

      const card = state.availableCards.find((c) => c.id === cardId);
      if (!card) return state;

      // Check if slot is already occupied
      if (state.slots[slotIndex] !== null) {
        return {
          ...state,
          shakingCardId: cardId,
          speechText: voiceLines.hint || "That slot already has a card! Let's try another one."
        };
      }

      const isCorrect = card.correctSlot === slotIndex;

      if (isCorrect) {
        // --- CORRECT PLACEMENT ---
        const newSlots = [...state.slots];
        newSlots[slotIndex] = card;
        const remainingCards = state.availableCards.filter((c) => c.id !== cardId);
        const allFilled = newSlots.every((s) => s !== null);

        const nextSpeech = allFilled
          ? (voiceLines.success || "All steps are in order! Watch how it works!")
          : `Nice! Step ${slotIndex + 1} is in place!`;

        return {
          ...state,
          slots: newSlots,
          availableCards: remainingCards,
          selectedCardId: null,
          shakingCardId: null,
          pulsingCardId: null,
          justPlacedCardId: cardId,
          interactions: state.interactions + 1,
          companionMood: 'cheer',
          speechText: nextSpeech,
          phase: allFilled ? 'demonstration' : 'ordering',
          demoStep: 0
        };
      } else {
        // --- MISPLACEMENT (POSITIVE WORDING ONLY) ---
        const newMisplacements = state.misplacements + 1;
        const newInteractions = state.interactions + 1;

        // If child has mislocated twice, auto-assist!
        if (newMisplacements >= 2) {
          // Find the first empty slot
          const firstEmptySlot = state.slots.findIndex((s) => s === null);
          if (firstEmptySlot !== -1) {
            // Find the correct card for this slot
            const assistCard = state.availableCards.find((c) => c.correctSlot === firstEmptySlot);
            if (assistCard) {
              const newSlots = [...state.slots];
              newSlots[firstEmptySlot] = assistCard;
              const remaining = state.availableCards.filter((c) => c.id !== assistCard.id);
              const allFilled = newSlots.every((s) => s !== null);

              return {
                ...state,
                slots: newSlots,
                availableCards: remaining,
                selectedCardId: null,
                shakingCardId: null,
                pulsingCardId: assistCard.id,
                justPlacedCardId: assistCard.id,
                misplacements: newMisplacements,
                interactions: newInteractions,
                assisted: true,
                companionMood: 'assist',
                speechText: voiceLines.assist || "Let's put this one right here! You've got this.",
                phase: allFilled ? 'demonstration' : 'ordering',
                demoStep: 0
              };
            }
          }
        }

        // Just 1 misplacement: gentle float back with hint
        return {
          ...state,
          selectedCardId: null,
          shakingCardId: cardId,
          misplacements: newMisplacements,
          interactions: newInteractions,
          companionMood: 'idle',
          speechText: voiceLines.hint || "Almost! Let's try placing this step where it happens first."
        };
      }
    }

    case 'AUTO_ASSIST': {
      if (state.phase !== 'ordering') return state;
      const { voiceLines = {} } = action.payload || {};

      const firstEmptySlot = state.slots.findIndex((s) => s === null);
      if (firstEmptySlot === -1) return state;

      const assistCard = state.availableCards.find((c) => c.correctSlot === firstEmptySlot);
      if (!assistCard) return state;

      const newSlots = [...state.slots];
      newSlots[firstEmptySlot] = assistCard;
      const remaining = state.availableCards.filter((c) => c.id !== assistCard.id);
      const allFilled = newSlots.every((s) => s !== null);

      return {
        ...state,
        slots: newSlots,
        availableCards: remaining,
        selectedCardId: null,
        shakingCardId: null,
        pulsingCardId: assistCard.id,
        justPlacedCardId: assistCard.id,
        assisted: true,
        interactions: state.interactions + 1,
        companionMood: 'assist',
        speechText: voiceLines.assist || "I'll help place this one for you!",
        phase: allFilled ? 'demonstration' : 'ordering',
        demoStep: 0
      };
    }

    case 'AUTO_FINISH': {
      // Soft internal 30s cap or manual stall simulation:
      // Fill all slots in their correct positions with zero feeling of failure
      const { voiceLines = {} } = action.payload || {};
      const newSlots = [null, null, null];

      // Place all cards in correct slots
      const allCards = [
        ...state.slots.filter(Boolean),
        ...state.availableCards
      ];
      allCards.forEach((c) => {
        newSlots[c.correctSlot] = c;
      });

      return {
        ...state,
        slots: newSlots,
        availableCards: [],
        selectedCardId: null,
        shakingCardId: null,
        pulsingCardId: null,
        assisted: true,
        companionMood: 'cheer',
        speechText: voiceLines.success || "All steps are ready! Let's see the magic in action!",
        phase: 'demonstration',
        demoStep: 0
      };
    }

    case 'ADVANCE_DEMO': {
      if (state.phase !== 'demonstration') return state;
      const nextStep = state.demoStep + 1;
      const isDone = nextStep >= state.totalDemoSteps;

      return {
        ...state,
        demoStep: nextStep,
        phase: isDone ? 'celebration' : 'demonstration',
        companionMood: isDone ? 'cheer' : 'demo'
      };
    }

    case 'COMPLETE_GAME': {
      return {
        ...state,
        phase: 'completed',
        endTime: Date.now()
      };
    }

    default:
      return state;
  }
}
