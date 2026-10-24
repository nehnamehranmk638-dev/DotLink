import React, { useState, useCallback, useRef, useEffect } from 'react';
import RemediationGame from './RemediationGame';

export async function submitRemediationLog(payload) {
  try {
    await fetch('/api/remediation/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch { /* Optional telemetry never interrupts learning. */ }
}

export function useRemediationFlow({ onFlowComplete, pauseTimers, resumeTimers, reduceMotion = false, soundEnabled = false } = {}) {
  const [active, setActive] = useState(null);
  const [phase, setPhase] = useState('idle');
  const callback = useRef(null), timer = useRef(null), completed = useRef(false), seen = useRef(new Set());
  const latest = useRef({ onFlowComplete, pauseTimers, resumeTimers });
  useEffect(() => { latest.current = { onFlowComplete, pauseTimers, resumeTimers }; });
  useEffect(() => () => clearTimeout(timer.current), []);
  const triggerRemediation = useCallback((response, onContinue, context = {}) => {
    if (response?.result !== 'breakdown' || !response.remediation) return false;
    const key = `${context.sessionId || ''}:${context.quizSet || ''}:${context.questionId || response.highlightOptionId}`;
    if (seen.current.has(key)) return false;
    seen.current.add(key);
    completed.current = false;
    callback.current = onContinue;
    latest.current.pauseTimers?.();
    setActive({ config: response.remediation, highlightOptionId: response.highlightOptionId, context, returnFocusTo: document.activeElement });
    setPhase('game');
    return true;
  }, []);
  const handleComplete = useCallback(payload => {
    if (completed.current || !active) return;
    completed.current = true;
    submitRemediationLog({ ...payload, quiz_set: active.context.quizSet || 'quiz_a', question_id: active.context.questionId, session_id: active.context.sessionId });
    setPhase('aha');
    timer.current = setTimeout(() => {
      setPhase('idle'); setActive(null);
      latest.current.resumeTimers?.();
      const continueFlow = callback.current; callback.current = null;
      continueFlow?.(); latest.current.onFlowComplete?.();
    }, 3000);
  }, [active]);
  const popup = active ? <RemediationGame restoreFocusTo={active.returnFocusTo} config={active.config} onComplete={handleComplete} reveal={phase === 'aha'} reduceMotion={reduceMotion} soundEnabled={soundEnabled} /> : null;
  const RemediationPopup = () => popup;
  return { triggerRemediation, isRemediating: phase !== 'idle', isAhaRevealing: phase === 'aha',
    highlightedId: phase === 'aha' ? active?.highlightOptionId : null,
    ahaCompanionLine: phase === 'aha' ? 'Aha! Look at the glowing answer. Let’s try again.' : '',
    remediationPopup: popup, RemediationPopup };
}
