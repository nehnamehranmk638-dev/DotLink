import React, { useEffect, useReducer, useRef, useState } from 'react';
import { initOrderStepsState, orderStepsReducer } from './orderStepsReducer';
import { getThemedObject, getCompanion } from './assets';
import { playSoftChime, playSoftPop } from './sound';
import Companion from './Companion';

export default function OrderStepsGame({ config, onComplete, reduceMotion = false, soundEnabled = false }) {
  const { steps = [], voiceLines = {}, companion = 'luna', problem = { a: 3, b: 2, op: '+' }, objectKey = 'dino_egg' } = config;
  const [state, dispatch] = useReducer(orderStepsReducer, null, () => initOrderStepsState(steps, voiceLines));
  const drag = useRef(null);
  const completed = useRef(false);
  const [demoCount, setDemoCount] = useState(0);
  const a = Math.max(0, problem.a ?? 3), b = Math.max(0, problem.b ?? 2);
  const total = problem.op === '-' ? Math.max(0, a - b) : a + b;
  const object = getThemedObject(objectKey);
  useEffect(() => {
    const cap = setTimeout(() => dispatch({ type: 'AUTO_FINISH', payload: { voiceLines } }), config.simulateStalling ? 1000 : 24000);
    return () => clearTimeout(cap);
  }, [voiceLines, config.simulateStalling]);
  useEffect(() => { if (state.justPlacedCardId) playSoftChime(soundEnabled); }, [state.justPlacedCardId, soundEnabled]);
  useEffect(() => {
    if (state.phase !== 'demonstration') return;
    // Every concrete object is tapped in sequence before groups merge or objects leave.
    const count = Math.max(1, problem.op === '-' ? a : a + b);
    let tick = 0;
    const timer = setInterval(() => {
      tick += 1;
      setDemoCount(tick);
      playSoftPop(soundEnabled);
      if (tick >= count) {
        clearInterval(timer);
        dispatch({ type: 'ADVANCE_DEMO' }); dispatch({ type: 'ADVANCE_DEMO' });
        dispatch({ type: 'ADVANCE_DEMO' }); dispatch({ type: 'ADVANCE_DEMO' });
      }
    }, Math.min(250, 3000 / count));
    return () => clearInterval(timer);
  }, [state.phase, a, b, problem.op, soundEnabled]);
  useEffect(() => {
    if (state.phase !== 'celebration') return;
    const timer = setTimeout(() => {
      if (completed.current) return;
      completed.current = true;
      onComplete?.({ gameType: 'order_steps', assisted: state.assisted, interactions: state.interactions,
        misplacements: state.misplacements, durationMs: Date.now() - state.startTime });
    }, 1000);
    return () => clearTimeout(timer);
  }, [state.phase, state.assisted, state.interactions, state.misplacements, state.startTime, onComplete]);
  const place = (cardId, slotIndex) => dispatch({ type: 'PLACE_CARD', payload: { cardId, slotIndex, voiceLines } });
  const pointerDown = (event, card) => {
    if (event.button !== 0) return;
    drag.current = { id: card.id, x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const pointerMove = event => {
    if (drag.current && Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) > 8) {
      drag.current.moved = true;
      event.currentTarget.style.transform = `translate(${event.clientX - drag.current.x}px, ${event.clientY - drag.current.y}px)`;
    }
  };
  const pointerUp = event => {
    const current = drag.current;
    event.currentTarget.style.transform = '';
    if (!current?.moved) return;
    event.currentTarget.style.pointerEvents = 'none';
    const slot = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-slot]');
    event.currentTarget.style.pointerEvents = '';
    if (slot) place(current.id, Number(slot.dataset.slot));
    // Suppress the click synthesized after a drag; tap remains an ordinary click.
    setTimeout(() => { drag.current = null; }, 0);
  };
  const keyboard = (event, action) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action(); } };
  return <div className="remediation-game">
    <Companion companionKey={companion} mood={state.companionMood} speechText={state.speechText} reduceMotion={reduceMotion} soundEnabled={soundEnabled} />
    <h1>Companion’s Secret Steps</h1>
    {state.phase === 'ordering' ? <>
      <p>Drag a card to a space, or tap a card and then its space.</p>
      <div className="steps-grid" aria-label="Step order">
        {state.slots.map((card, index) => <div role="button" tabIndex={0} key={index} data-slot={index}
          aria-label={`Slot ${index + 1}${card ? `: contains ${card.label}` : ', empty'}`}
          className={`step-slot ${card ? 'placed' : ''} ${card?.id === state.pulsingCardId ? 'assisted' : ''}`}
          onClick={() => state.selectedCardId && place(state.selectedCardId, index)}
          onKeyDown={e => keyboard(e, () => state.selectedCardId && place(state.selectedCardId, index))}>
          <span className="slot-number">{index + 1}</span>
          {card ? <><span className="game-icon" aria-hidden="true">{getThemedObject(card.iconKey || objectKey).emoji}</span><span>{card.label}</span></> : <span>Place here</span>}
        </div>)}
      </div>
      <div className="steps-grid" aria-label="Cards to order">
        {state.availableCards.map(card => <div key={card.id} role="button" tabIndex={0}
          aria-label={`Step card: ${card.label}`} aria-pressed={state.selectedCardId === card.id}
          className={`step-card ${state.selectedCardId === card.id ? 'selected' : ''} ${state.shakingCardId === card.id ? 'gentle-return' : ''}`}
          onPointerDown={e => pointerDown(e, card)} onPointerMove={pointerMove} onPointerUp={pointerUp}
          onPointerCancel={e => { drag.current = null; e.currentTarget.style.transform = ''; }}
          onClick={() => { if (!drag.current?.moved) dispatch({ type: 'SELECT_CARD', payload: { cardId: card.id } }); }}
          onKeyDown={e => keyboard(e, () => dispatch({ type: 'SELECT_CARD', payload: { cardId: card.id } }))}>
          <span className="game-icon" aria-hidden="true">{getThemedObject(card.iconKey || objectKey).emoji}</span><span>{card.label}</span>
        </div>)}
      </div>
    </> : <div className="demonstration" aria-live="polite">
      {config.concept ? <><h2>Let’s use our three steps</h2><p>{config.concept}</p></> : <>
        <h2>{problem.op === '-' ? `Start with ${a}. Take away ${b}.` : `Bring ${a} and ${b} together.`}</h2>
        <div className="object-stage">
          <span className="walking-companion" style={{ left: `${Math.min(90, demoCount / Math.max(1, a + b) * 90)}%` }} aria-hidden="true">{getCompanion(typeof companion === 'object' ? companion.key : companion).emoji}</span>
          {Array.from({ length: problem.op === '-' ? a : a + b }, (_, index) => <span key={index}
            className={`counted-object ${index < demoCount ? 'lit' : ''} ${state.phase === 'celebration' && problem.op === '-' && index >= total ? 'taken-away' : ''}`}
            style={{ marginLeft: problem.op === '+' && index === a && state.phase !== 'celebration' ? 36 : 0 }} aria-hidden="true">{object.emoji}</span>)}
        </div>
        {state.phase === 'celebration' && <p className="total-badge">{a} {problem.op} {b} = {total}</p>}
      </>}
    </div>}
  </div>;
}
