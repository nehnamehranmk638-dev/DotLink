import { describe, it, expect } from 'vitest';
import { initOrderStepsState, orderStepsReducer } from '../orderStepsReducer';

describe('orderStepsReducer', () => {
  const mockSteps = [
    { id: 'step-1', label: 'Count first group', iconKey: 'dino_egg' },
    { id: 'step-2', label: 'Count second group', iconKey: 'baby_dino' },
    { id: 'step-3', label: 'Count all together', iconKey: 'star' }
  ];

  const mockVoiceLines = {
    intro: 'Ready to order steps?',
    hint: 'Almost! Try another place.',
    assist: 'Here is a helping hand!',
    success: 'Fantastic!'
  };

  it('initializes state with 3 indexed cards and empty slots', () => {
    const state = initOrderStepsState(mockSteps, mockVoiceLines);
    expect(state.slots).toEqual([null, null, null]);
    expect(state.availableCards.length).toBe(3);
    expect(state.misplacements).toBe(0);
    expect(state.interactions).toBe(0);
    expect(state.assisted).toBe(false);
    expect(state.phase).toBe('ordering');
  });

  it('selects and unselects a card on tap', () => {
    const state = initOrderStepsState(mockSteps, mockVoiceLines);
    const state2 = orderStepsReducer(state, {
      type: 'SELECT_CARD',
      payload: { cardId: 'step-1' }
    });
    expect(state2.selectedCardId).toBe('step-1');

    // Tapping again unselects
    const state3 = orderStepsReducer(state2, {
      type: 'SELECT_CARD',
      payload: { cardId: 'step-1' }
    });
    expect(state3.selectedCardId).toBeNull();
  });

  it('correctly places a card into its matching slot', () => {
    // step-1 belongs in slot 0
    const state = initOrderStepsState(mockSteps, mockVoiceLines);
    const nextState = orderStepsReducer(state, {
      type: 'PLACE_CARD',
      payload: { cardId: 'step-1', slotIndex: 0, voiceLines: mockVoiceLines }
    });

    expect(nextState.slots[0]).not.toBeNull();
    expect(nextState.slots[0].id).toBe('step-1');
    expect(nextState.availableCards.find((c) => c.id === 'step-1')).toBeUndefined();
    expect(nextState.interactions).toBe(1);
    expect(nextState.misplacements).toBe(0);
    expect(nextState.companionMood).toBe('cheer');
  });

  it('records misplacement without negative wording on wrong slot', () => {
    // step-1 belongs in slot 0, trying slot 2
    const state = initOrderStepsState(mockSteps, mockVoiceLines);
    const nextState = orderStepsReducer(state, {
      type: 'PLACE_CARD',
      payload: { cardId: 'step-1', slotIndex: 2, voiceLines: mockVoiceLines }
    });

    expect(nextState.slots[2]).toBeNull();
    expect(nextState.misplacements).toBe(1);
    expect(nextState.interactions).toBe(1);
    expect(nextState.shakingCardId).toBe('step-1');
    expect(nextState.speechText).toBe(mockVoiceLines.hint);
  });

  it('triggers auto-assist after 2 misplacements and sets assisted=true', () => {
    let state = initOrderStepsState(mockSteps, mockVoiceLines);

    // First misplacement
    state = orderStepsReducer(state, {
      type: 'PLACE_CARD',
      payload: { cardId: 'step-1', slotIndex: 2, voiceLines: mockVoiceLines }
    });
    expect(state.misplacements).toBe(1);
    expect(state.assisted).toBe(false);

    // Second misplacement triggers auto-assist for first empty slot (slot 0)
    state = orderStepsReducer(state, {
      type: 'PLACE_CARD',
      payload: { cardId: 'step-2', slotIndex: 0, voiceLines: mockVoiceLines }
    });

    expect(state.misplacements).toBe(2);
    expect(state.assisted).toBe(true);
    expect(state.slots[0]).not.toBeNull();
    expect(state.slots[0].id).toBe('step-1'); // Correct card for slot 0 auto-placed
    expect(state.speechText).toBe(mockVoiceLines.assist);
  });

  it('auto-finishes cleanly on stall or 30s cap with assisted=true', () => {
    const state = initOrderStepsState(mockSteps, mockVoiceLines);
    const finishedState = orderStepsReducer(state, {
      type: 'AUTO_FINISH',
      payload: { voiceLines: mockVoiceLines }
    });

    expect(finishedState.slots[0].id).toBe('step-1');
    expect(finishedState.slots[1].id).toBe('step-2');
    expect(finishedState.slots[2].id).toBe('step-3');
    expect(finishedState.availableCards.length).toBe(0);
    expect(finishedState.assisted).toBe(true);
    expect(finishedState.phase).toBe('demonstration');
  });

  it('transitions to demonstration when all 3 cards are placed', () => {
    let state = initOrderStepsState(mockSteps, mockVoiceLines);

    state = orderStepsReducer(state, {
      type: 'PLACE_CARD',
      payload: { cardId: 'step-1', slotIndex: 0, voiceLines: mockVoiceLines }
    });
    state = orderStepsReducer(state, {
      type: 'PLACE_CARD',
      payload: { cardId: 'step-2', slotIndex: 1, voiceLines: mockVoiceLines }
    });
    state = orderStepsReducer(state, {
      type: 'PLACE_CARD',
      payload: { cardId: 'step-3', slotIndex: 2, voiceLines: mockVoiceLines }
    });

    expect(state.phase).toBe('demonstration');
    expect(state.slots.every(Boolean)).toBe(true);
  });
});
