import React, { useEffect, useRef, useState } from 'react';

// Shared by lessons and quizzes. The prompt itself pauses the response clock.
export default function StudentInactivity({ paused = false, timeoutMs = 30000, onPause, onResume, onAutoPause }) {
  const [open, setOpen] = useState(false);
  const lastActivity = useRef(0);
  const button = useRef(null), previous = useRef(null);
  const callbacks = useRef({ onPause, onResume, onAutoPause });
  const prompting = useRef(false);
  useEffect(() => { callbacks.current = { onPause, onResume, onAutoPause }; });
  useEffect(() => {
    lastActivity.current = Date.now();
    if (paused || open) return;
    const activity = () => { lastActivity.current = Date.now(); };
    const events = ['pointerdown', 'pointermove', 'keydown', 'touchstart'];
    events.forEach(event => window.addEventListener(event, activity, { passive: true }));
    const tick = setInterval(() => {
      if (!prompting.current && Date.now() - lastActivity.current >= timeoutMs) {
        prompting.current = true;
        previous.current = document.activeElement; callbacks.current.onPause?.(); setOpen(true);
      }
    }, 250);
    return () => { clearInterval(tick); events.forEach(event => window.removeEventListener(event, activity)); };
  }, [paused, open, timeoutMs]);
  useEffect(() => {
    if (!open) return;
    button.current?.focus();
    const cap = setTimeout(() => { if (callbacks.current.onAutoPause) callbacks.current.onAutoPause(); }, 30000);
    return () => clearTimeout(cap);
  }, [open]);
  if (!open) return null;
  return <div className="modal-overlay" style={{ zIndex: 900 }}>
    <div className="glass-panel modal-content" role="dialog" aria-modal="true" aria-labelledby="student-idle-title" style={{ textAlign: 'left' }}>
      <h2 id="student-idle-title">Are you there?</h2><p>Your lesson is waiting for you.</p>
      <button ref={button} className="btn btn-primary" style={{ minHeight: 56, fontSize: 20 }}
        onKeyDown={e => { if (e.key === 'Tab') e.preventDefault(); }}
        onClick={() => { lastActivity.current = Date.now(); prompting.current = false; setOpen(false); callbacks.current.onResume?.(); queueMicrotask(() => previous.current?.focus()); }}>I’m here. Let’s continue!</button>
    </div>
  </div>;
}
