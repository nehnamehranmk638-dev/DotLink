/**
 * Pure state reducer for Game 2: "Match the Numbers" (Match Pairs, Face-Up Variant)
 *
 * Face-up matching keeps working memory load low for ADHD learners.
 * Tracks matched pairs, handles tap-to-match and line drag,
 * auto-assists after 2 mismatches, and triggers calm celebration.
 */

export function initMatchPairsState(pairs = [], voiceLines = {}) {
  // Extract left items (numerals) and right items (object groups)
  const leftItems = pairs.map((p) => ({
    id: p.id,
    type: p.left.type,
    value: p.left.value,
    pairId: p.id
  }));

  const rightItems = pairs.map((p) => ({
    id: p.id,
    type: p.right.type,
    objectKey: p.right.objectKey,
    count: p.right.count,
    pairId: p.id
  }));

  // Shuffle right items so they aren't positioned directly opposite by default
  const shuffledRight = [...rightItems].sort(() => Math.random() - 0.5);

  return {
    leftItems,
    rightItems: shuffledRight,
    matchedPairIds: [], // array of pair IDs that have been successfully linked
    selectedLeftId: null,
    selectedRightId: null,
    mismatches: 0,
    interactions: 0,
    assisted: false,
    shakingItemId: null,
    pulsingPairId: null,
    companionMood: 'idle', // 'idle' | 'cheer' | 'assist'
    speechText: voiceLines.intro || "Match the number to the group of items!",
    phase: 'matching', // 'matching' | 'celebration' | 'completed'
    startTime: Date.now(),
    endTime: null
  };
}

export function matchPairsReducer(state, action) {
  switch (action.type) {
    case 'SELECT_LEFT': {
      if (state.phase !== 'matching') return state;
      const { id, voiceLines = {} } = action.payload;

      // Cannot select already matched item
      if (state.matchedPairIds.includes(id)) return state;

      // If clicking already selected left, toggle off
      if (state.selectedLeftId === id) {
        return { ...state, selectedLeftId: null, shakingItemId: null };
      }

      // If a right item is already selected, attempt to match!
      if (state.selectedRightId) {
        return handleMatchAttempt(
          { ...state, selectedLeftId: id },
          id,
          state.selectedRightId,
          voiceLines
        );
      }

      return {
        ...state,
        selectedLeftId: id,
        shakingItemId: null
      };
    }

    case 'SELECT_RIGHT': {
      if (state.phase !== 'matching') return state;
      const { id, voiceLines = {} } = action.payload;

      // Cannot select already matched item
      if (state.matchedPairIds.includes(id)) return state;

      // If clicking already selected right, toggle off
      if (state.selectedRightId === id) {
        return { ...state, selectedRightId: null, shakingItemId: null };
      }

      // If a left item is already selected, attempt to match!
      if (state.selectedLeftId) {
        return handleMatchAttempt(
          { ...state, selectedRightId: id },
          state.selectedLeftId,
          id,
          voiceLines
        );
      }

      return {
        ...state,
        selectedRightId: id,
        shakingItemId: null
      };
    }

    case 'AUTO_ASSIST': {
      if (state.phase !== 'matching') return state;
      const { voiceLines = {} } = action.payload || {};

      // Find first unmatched pair
      const unmatchedLeft = state.leftItems.find((item) => !state.matchedPairIds.includes(item.id));
      if (!unmatchedLeft) return state;

      const newMatched = [...state.matchedPairIds, unmatchedLeft.id];
      const allDone = newMatched.length === state.leftItems.length;

      return {
        ...state,
        matchedPairIds: newMatched,
        selectedLeftId: null,
        selectedRightId: null,
        shakingItemId: null,
        pulsingPairId: unmatchedLeft.id,
        assisted: true,
        interactions: state.interactions + 1,
        companionMood: 'assist',
        speechText: voiceLines.assist || "Here's a match! You're doing great.",
        phase: allDone ? 'celebration' : 'matching'
      };
    }

    case 'AUTO_FINISH': {
      const { voiceLines = {} } = action.payload || {};
      const allPairIds = state.leftItems.map((item) => item.id);

      return {
        ...state,
        matchedPairIds: allPairIds,
        selectedLeftId: null,
        selectedRightId: null,
        shakingItemId: null,
        pulsingPairId: null,
        assisted: true,
        companionMood: 'cheer',
        speechText: voiceLines.success || "All matched up! Wonderful job!",
        phase: 'celebration'
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

/**
 * Helper to process a match attempt between leftId and rightId
 */
function handleMatchAttempt(state, leftId, rightId, voiceLines) {
  const left = state.leftItems.find(item => item.id === leftId);
  const right = state.rightItems.find(item => item.id === rightId);
  const isMatch = left && right && left.value === right.count;

  if (isMatch) {
    const newMatched = [...state.matchedPairIds, leftId];
    const allDone = newMatched.length === state.leftItems.length;

    return {
      ...state,
      matchedPairIds: newMatched,
      rightItems: state.rightItems.map(item => item.id === rightId ? { ...item, id: leftId } : item.id === leftId ? { ...item, id: rightId } : item),
      selectedLeftId: null,
      selectedRightId: null,
      shakingItemId: null,
      pulsingPairId: null,
      interactions: state.interactions + 1,
      companionMood: 'cheer',
      speechText: allDone
        ? (voiceLines.success || "All pairs matched! You did it!")
        : "Nice match! That's it!",
      phase: allDone ? 'celebration' : 'matching'
    };
  } else {
    // Mismatch
    const newMismatches = state.mismatches + 1;
    const newInteractions = state.interactions + 1;

    // After 2 mismatches, trigger auto-assist on right match
    if (newMismatches >= 2) {
      // Find the correct matching partner for leftId
      const targetPairId = leftId;
      return {
        ...state,
        selectedLeftId: leftId,
        selectedRightId: null,
        shakingItemId: rightId,
        pulsingPairId: targetPairId,
        mismatches: newMismatches,
        interactions: newInteractions,
        assisted: true,
        companionMood: 'assist',
        speechText: voiceLines.assist || "Look closely at the glowing pair! That's the one."
      };
    }

    return {
      ...state,
      selectedLeftId: null,
      selectedRightId: null,
      shakingItemId: rightId,
      mismatches: newMismatches,
      interactions: newInteractions,
      companionMood: 'idle',
      speechText: voiceLines.hint || "Almost! Count the items carefully and try again."
    };
  }
}
