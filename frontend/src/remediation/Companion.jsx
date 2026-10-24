import React, { useEffect } from 'react';
import { getCompanion } from './assets';
import { speakLine } from './sound';

export default function Companion({ companionKey, mood = 'idle', speechText = '', reduceMotion = false, soundEnabled = false }) {
  const companion = typeof companionKey === 'object' ? { ...getCompanion(companionKey.key), ...companionKey } : getCompanion(companionKey);
  useEffect(() => { if (speechText) speakLine(speechText, soundEnabled); return () => { if (soundEnabled) window.speechSynthesis?.cancel(); }; }, [speechText, soundEnabled]);
  return <div className="remediation-companion" aria-label={`${companion.name} speaking`}>
    <div aria-hidden="true" className={`companion-avatar ${!reduceMotion && mood === 'cheer' ? 'companion-cheer' : !reduceMotion ? 'companion-idle' : ''}`}>
      {companion.svg ? companion.svg() : companion.emoji}
    </div>
    <div className="companion-bubble"><strong>{companion.name}</strong><p role="status" aria-live="polite">{speechText}</p></div>
  </div>;
}
