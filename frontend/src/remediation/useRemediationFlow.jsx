import React, { useState, useCallback, useRef } from 'react';
import RemediationGame from './RemediationGame';

/**
 * Stub function to log remediation completion telemetry
 * Fails silently if offline or endpoint not yet configured on backend.
 */
export async function submitRemediationLog(payload) {
  try {
    await fetch('/api/remediation/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (_) {
    // Fail silently per specification
  }
}

/**
 * useRemediationFlow Hook
 *
 * Manages remediation lifecycle:
 * 1. Shows popup when check-in API returns result: "breakdown" with remediation config
 * 2. On game completion, posts log silently to /api/remediation/log
 * 3. Plays a 3-second "Aha" reveal with companion cheering and a soft glow on highlightOptionId
 * 4. Calls callback so the app seamlessly continues
 */
export function useRemediationFlow({
  onFlowComplete,
  reduceMotion = false,
  soundEnabled = false
} = {}) {
  const [activeRemediation, setActiveRemediation] = useState(null);
  const [isAhaRevealing, setIsAhaRevealing] = useState(false);
  const [highlightedId, setHighlightedId] = useState(null);
  const [ahaCompanionLine, setAhaCompanionLine] = useState('');
  const callbackRef = useRef(null);

  /**
   * Call when check-in API response arrives
   * @param {Object} response - { result: "breakdown", remediation: config, highlightOptionId: "opt-1" }
   * @param {Function} onContinue - Optional callback invoked after 3s "Aha" reveal
   */
  const triggerRemediation = useCallback((response, onContinue) => {
    if (response?.result === 'breakdown' && response?.remediation) {
      callbackRef.current = onContinue;
      setActiveRemediation({
        config: response.remediation,
        highlightOptionId: response.highlightOptionId || null
      });
      return true;
    }
    return false;
  }, []);

  /**
   * Internal completion handler invoked by RemediationGame
   */
  const handleGameComplete = useCallback(
    async (logPayload) => {
      // 1. Submit telemetry log silently
      submitRemediationLog(logPayload);

      const targetHighlightId = activeRemediation?.highlightOptionId;

      // 2. Close the mini-game popup
      setActiveRemediation(null);

      // 3. Play 3-second "Aha" reveal
      setIsAhaRevealing(true);
      setHighlightedId(targetHighlightId);
      setAhaCompanionLine("Aha! Look here! Now you know the secret steps!");

      setTimeout(() => {
        setIsAhaRevealing(false);
        setHighlightedId(null);
        setAhaCompanionLine('');

        // 4. Continue host app flow
        if (callbackRef.current) {
          callbackRef.current();
          callbackRef.current = null;
        }
        if (onFlowComplete) {
          onFlowComplete();
        }
      }, 3000);
    },
    [activeRemediation, onFlowComplete]
  );

  /**
   * Render helper for the popup
   */
  const RemediationPopup = useCallback(() => {
    if (!activeRemediation) return null;
    return (
      <RemediationGame
        config={activeRemediation.config}
        onComplete={handleGameComplete}
        reduceMotion={reduceMotion}
        soundEnabled={soundEnabled}
      />
    );
  }, [activeRemediation, handleGameComplete, reduceMotion, soundEnabled]);

  return {
    triggerRemediation,
    isRemediating: !!activeRemediation,
    isAhaRevealing,
    highlightedId,
    ahaCompanionLine,
    submitRemediationLog,
    RemediationPopup
  };
}
