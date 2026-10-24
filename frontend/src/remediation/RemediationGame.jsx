import React, { useEffect, useRef, useState } from 'react';
import { getGame } from './gameRegistry';
import { getTheme } from './assets';
import './remediation.css';
import Companion from './Companion';

export default function RemediationGame({ config, onComplete, reduceMotion = false, soundEnabled = false, reveal = false, restoreFocusTo }) {
  const dialog = useRef(null);
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = event => setSystemReduced(event.matches);
    query?.addEventListener('change', update);
    return () => query?.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const previous = restoreFocusTo || document.activeElement;
    const node = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    node.focus();
    const trap = event => {
      if (event.key === 'Escape') event.preventDefault();
      if (event.key !== 'Tab') return;
      const controls = [...node.querySelectorAll('button:not(:disabled), [tabindex="0"]')];
      if (!controls.length) { event.preventDefault(); node.focus(); return; }
      const first = controls[0] || node;
      const last = controls.at(-1) || node;
      if (!node.contains(document.activeElement) || (document.activeElement !== node && !controls.includes(document.activeElement))) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === node)) { event.preventDefault(); first.focus(); }
    };
    const contain = event => { if (!node.contains(event.target)) node.focus(); };
    document.addEventListener('keydown', trap, true);
    const observer = new MutationObserver(() => { if (!node.contains(document.activeElement)) node.focus(); });
    observer.observe(node, { childList: true, subtree: true });
    document.addEventListener('focusin', contain);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', trap, true);
      observer.disconnect();
      document.removeEventListener('focusin', contain);
      if (previous?.isConnected) previous.focus();
      queueMicrotask(() => { if (previous?.isConnected) previous.focus(); });
    };
  }, [restoreFocusTo]);
  useEffect(() => { if (reveal) dialog.current?.focus(); }, [reveal]);
  const theme = getTheme(config?.theme);
  const Game = getGame(config?.gameType || 'order_steps');
  return <div className="remediation-overlay" style={{ '--theme-accent': theme.accent, '--theme-tint': theme.bgTint }}>
    <section ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Learning Mini-Game"
      className={`remediation-dialog ${reduceMotion || systemReduced ? 'reduce-motion' : ''}`}>
      <p className="remediation-eyebrow">A little discovery together</p>
      {reveal ? <Companion companionKey={config.companion} mood="cheer" speechText="Aha! Look at the glowing answer. Let’s try our question again." reduceMotion={reduceMotion || systemReduced} soundEnabled={soundEnabled} /> : React.createElement(Game, { config, onComplete, reduceMotion: reduceMotion || systemReduced, soundEnabled })}
    </section>
  </div>;
}
