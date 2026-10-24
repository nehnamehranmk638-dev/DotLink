import React, { useReducer, useEffect, useRef, useState } from 'react';
import { initMatchPairsState, matchPairsReducer } from './matchPairsReducer';
import { getThemedObject } from './assets';
import { playSoftChime } from './sound';
import Companion from './Companion';

export default function MatchPairsGame({ config, onComplete, reduceMotion = false, soundEnabled = false }) {
  const { pairs = [], voiceLines = {}, companion = 'luna' } = config;
  const [state, dispatch] = useReducer(matchPairsReducer, null, () => initMatchPairsState(pairs, voiceLines));
  const board = useRef(null), left = useRef({}), right = useRef({}), done = useRef(false);
  const [lines, setLines] = useState([]);
  useEffect(() => {
    const cap = setTimeout(() => dispatch({ type: 'AUTO_FINISH', payload: { voiceLines } }), config.simulateStalling ? 1000 : 28000);
    return () => clearTimeout(cap);
  }, [voiceLines, config.simulateStalling]);
  useEffect(() => {
    const measure = () => {
      if (!board.current) return;
      const bounds = board.current.getBoundingClientRect();
      setLines(state.matchedPairIds.map(id => {
        const l = left.current[id].getBoundingClientRect(), r = right.current[id].getBoundingClientRect();
        return { id, x1: l.right - bounds.left, y1: l.top + l.height / 2 - bounds.top, x2: r.left - bounds.left, y2: r.top + r.height / 2 - bounds.top };
      }));
    };
    measure(); window.addEventListener('resize', measure);
    if (state.matchedPairIds.length) playSoftChime(soundEnabled);
    return () => window.removeEventListener('resize', measure);
  }, [state.matchedPairIds, soundEnabled]);
  useEffect(() => {
    if (state.phase !== 'celebration') return;
    const timer = setTimeout(() => {
      if (done.current) return; done.current = true;
      onComplete?.({ gameType: 'match_pairs', assisted: state.assisted, interactions: state.interactions,
        misplacements: state.mismatches, durationMs: Date.now() - state.startTime });
    }, 1000);
    return () => clearTimeout(timer);
  }, [state.phase, state.assisted, state.interactions, state.mismatches, state.startTime, onComplete]);
  const choose = (type, id) => dispatch({ type, payload: { id, voiceLines } });
  const key = (e, action) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); action(); } };
  return <div className="remediation-game">
    <Companion companionKey={companion} mood={state.companionMood} speechText={state.speechText} reduceMotion={reduceMotion} soundEnabled={soundEnabled} />
    <h1>Match the Numbers</h1><p>Tap a number, then tap its group. Everything is here to see.</p>
    <div ref={board} className="pairs-board">
      <svg className="pair-lines" aria-hidden="true">{lines.map(line => <line key={line.id} {...line} stroke="var(--theme-accent)" strokeWidth="4" />)}</svg>
      <div className="pairs-column"><h2>Numbers</h2>{state.leftItems.map(item => <div key={item.id} ref={el => { left.current[item.id] = el; }}
        role="button" tabIndex={state.matchedPairIds.includes(item.id) ? -1 : 0}
        aria-label={`Number ${item.value}${state.matchedPairIds.includes(item.id) ? ', matched' : ''}`}
        className={`pair-card numeral ${state.matchedPairIds.includes(item.id) ? 'placed' : ''} ${state.selectedLeftId === item.id ? 'selected' : ''} ${state.pulsingPairId === item.id ? 'assisted' : ''}`}
        onClick={() => choose('SELECT_LEFT', item.id)} onKeyDown={e => key(e, () => choose('SELECT_LEFT', item.id))}>{item.value}</div>)}</div>
      <div className="pairs-column"><h2>Groups</h2>{state.rightItems.map(item => <div key={item.id} ref={el => { right.current[item.id] = el; }}
        role="button" tabIndex={state.matchedPairIds.includes(item.id) ? -1 : 0}
        aria-label={`Group of ${item.count} ${getThemedObject(item.objectKey).plural}${state.matchedPairIds.includes(item.id) ? ', matched' : ''}`}
        className={`pair-card ${state.matchedPairIds.includes(item.id) ? 'placed' : ''} ${state.selectedRightId === item.id ? 'selected' : ''} ${state.pulsingPairId === item.id ? 'assisted' : ''} ${state.shakingItemId === item.id ? 'gentle-return' : ''}`}
        onClick={() => choose('SELECT_RIGHT', item.id)} onKeyDown={e => key(e, () => choose('SELECT_RIGHT', item.id))}>
        {Array.from({ length: item.count }, (_, i) => <span key={i} aria-hidden="true">{getThemedObject(item.objectKey).emoji}</span>)}
        {item.count === 0 && <span>Empty group</span>}
      </div>)}</div>
    </div>
    {state.phase === 'celebration' && <p className="total-badge" role="status">Nice! Every number has a match.</p>}
  </div>;
}
