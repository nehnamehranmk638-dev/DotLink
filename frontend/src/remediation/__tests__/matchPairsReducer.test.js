import { describe, it, expect } from 'vitest';
import { initMatchPairsState, matchPairsReducer } from '../matchPairsReducer';

describe('matchPairsReducer', () => {
  const mockPairs = [
    { id: 'pair-1', left: { type: 'numeral', value: 3 }, right: { type: 'objects', objectKey: 'dino_egg', count: 3 } },
    { id: 'pair-2', left: { type: 'numeral', value: 2 }, right: { type: 'objects', objectKey: 'dino_egg', count: 2 } },
    { id: 'pair-3', left: { type: 'numeral', value: 5 }, right: { type: 'objects', objectKey: 'dino_egg', count: 5 } }
  ];

  const mockVoiceLines = {
    intro: 'Match each number to its group!',
    hint: 'Almost! Let us count again.',
    assist: 'Look at the glowing one!',
    success: 'All matched!'
  };

  it('initializes with 3 left and 3 right face-up items and zero matches', () => {
    const state = initMatchPairsState(mockPairs, mockVoiceLines);
    expect(state.leftItems.length).toBe(3);
    expect(state.rightItems.length).toBe(3);
    expect(state.matchedPairIds).toEqual([]);
    expect(state.mismatches).toBe(0);
    expect(state.interactions).toBe(0);
    expect(state.assisted).toBe(false);
    expect(state.phase).toBe('matching');
  });

  it('matches pair when selecting matching left then right', () => {
    let state = initMatchPairsState(mockPairs, mockVoiceLines);
    state = matchPairsReducer(state, {
      type: 'SELECT_LEFT',
      payload: { id: 'pair-1', voiceLines: mockVoiceLines }
    });
    expect(state.selectedLeftId).toBe('pair-1');

    state = matchPairsReducer(state, {
      type: 'SELECT_RIGHT',
      payload: { id: 'pair-1', voiceLines: mockVoiceLines }
    });

    expect(state.matchedPairIds).toContain('pair-1');
    expect(state.interactions).toBe(1);
    expect(state.mismatches).toBe(0);
    expect(state.companionMood).toBe('cheer');
  });

  it('handles mismatch gently with positive wording and tracks mismatch count', () => {
    let state = initMatchPairsState(mockPairs, mockVoiceLines);
    state = matchPairsReducer(state, {
      type: 'SELECT_LEFT',
      payload: { id: 'pair-1', voiceLines: mockVoiceLines }
    });
    // Attempt mismatch with pair-2
    state = matchPairsReducer(state, {
      type: 'SELECT_RIGHT',
      payload: { id: 'pair-2', voiceLines: mockVoiceLines }
    });

    expect(state.matchedPairIds).not.toContain('pair-1');
    expect(state.mismatches).toBe(1);
    expect(state.interactions).toBe(1);
    expect(state.speechText).toBe(mockVoiceLines.hint);
  });

  it('triggers auto-assist pulse after 2 mismatches and sets assisted=true', () => {
    let state = initMatchPairsState(mockPairs, mockVoiceLines);

    // Mismatch 1
    state = matchPairsReducer(state, {
      type: 'SELECT_LEFT',
      payload: { id: 'pair-1', voiceLines: mockVoiceLines }
    });
    state = matchPairsReducer(state, {
      type: 'SELECT_RIGHT',
      payload: { id: 'pair-2', voiceLines: mockVoiceLines }
    });
    expect(state.mismatches).toBe(1);
    expect(state.assisted).toBe(false);

    // Mismatch 2
    state = matchPairsReducer(state, {
      type: 'SELECT_LEFT',
      payload: { id: 'pair-1', voiceLines: mockVoiceLines }
    });
    state = matchPairsReducer(state, {
      type: 'SELECT_RIGHT',
      payload: { id: 'pair-3', voiceLines: mockVoiceLines }
    });

    expect(state.mismatches).toBe(2);
    expect(state.assisted).toBe(true);
    expect(state.pulsingPairId).toBe('pair-1');
    expect(state.speechText).toBe(mockVoiceLines.assist);
  });

  it('auto-finishes cleanly when stall cap triggers', () => {
    const state = initMatchPairsState(mockPairs, mockVoiceLines);
    const finishedState = matchPairsReducer(state, {
      type: 'AUTO_FINISH',
      payload: { voiceLines: mockVoiceLines }
    });

    expect(finishedState.matchedPairIds).toEqual(['pair-1', 'pair-2', 'pair-3']);
    expect(finishedState.assisted).toBe(true);
    expect(finishedState.phase).toBe('celebration');
  });

  it('transitions to celebration when all 3 pairs are matched', () => {
    let state = initMatchPairsState(mockPairs, mockVoiceLines);
    state = matchPairsReducer(state, { type: 'SELECT_LEFT', payload: { id: 'pair-1', voiceLines: mockVoiceLines } });
    state = matchPairsReducer(state, { type: 'SELECT_RIGHT', payload: { id: 'pair-1', voiceLines: mockVoiceLines } });

    state = matchPairsReducer(state, { type: 'SELECT_LEFT', payload: { id: 'pair-2', voiceLines: mockVoiceLines } });
    state = matchPairsReducer(state, { type: 'SELECT_RIGHT', payload: { id: 'pair-2', voiceLines: mockVoiceLines } });

    state = matchPairsReducer(state, { type: 'SELECT_LEFT', payload: { id: 'pair-3', voiceLines: mockVoiceLines } });
    state = matchPairsReducer(state, { type: 'SELECT_RIGHT', payload: { id: 'pair-3', voiceLines: mockVoiceLines } });

    expect(state.phase).toBe('celebration');
    expect(state.matchedPairIds.length).toBe(3);
  });
});
