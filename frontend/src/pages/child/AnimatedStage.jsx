import React, { useEffect, useRef, useState } from 'react';
import { animate, stagger } from 'animejs';
import { sound } from '../../utils/soundEffects';

export default function AnimatedStage({
  scene,
  sceneIndex,
  totalScenes,
  mascotName = 'Luna the Owl',
  isSpeaking = false,
  subjectTag = 'Maths',
  onInteraction = () => {}
}) {
  const stageRef = useRef(null);
  const mascotRef = useRef(null);
  const [particles, setParticles] = useState([]);
  const [activeInteractiveTip, setActiveInteractiveTip] = useState(null);
  const [activeScaleTilt, setActiveScaleTilt] = useState('left'); // 'left' | 'right' | 'equal'

  // Determine Mascot Icon & Friendly Greeting
  const mascotEmoji = mascotName.includes('Lion') ? '🦁' :
                      mascotName.includes('Owl') ? '🦉' :
                      mascotName.includes('Fox') ? '🦊' : '🐧';

  // Analyze Scene Theme to dynamically render educational interactive visuals
  const textCorpus = `${scene?.title || ''} ${scene?.visual_description || ''} ${scene?.narration_text || ''}`.toLowerCase();
  
  const isComparison = textCorpus.includes('>') || textCorpus.includes('<') || textCorpus.includes('compare') || 
                       textCorpus.includes('order') || textCorpus.includes('ascending') || textCorpus.includes('descending') ||
                       textCorpus.includes('greater') || textCorpus.includes('less');
  
  const isPlaceValue = !isComparison && (textCorpus.includes('place') || textCorpus.includes('digit') || 
                       textCorpus.includes('thousand') || textCorpus.includes('hundred') || textCorpus.includes('round') ||
                       textCorpus.includes('expanded') || textCorpus.includes('ten'));

  const isFractions = textCorpus.includes('fraction') || textCorpus.includes('half') || 
                      textCorpus.includes('part') || textCorpus.includes('whole');

  const isBricksGeometry = textCorpus.includes('brick') || textCorpus.includes('arch') || 
                           textCorpus.includes('pattern') || textCorpus.includes('curve') || 
                           textCorpus.includes('wall') || textCorpus.includes('symmetry');

  // Trigger Anime.js animations whenever the scene changes
  useEffect(() => {
    sound.playChime();

    // 1. Enter animation for visual stage elements
    if (stageRef.current) {
      animate('.stage-card-bounce', {
        scale: [0.65, 1.04, 1],
        opacity: [0, 1],
        translateY: [28, 0],
        delay: stagger(100),
        duration: 750,
        ease: 'outElastic(1, .6)'
      });

      animate('.floating-sparkle', {
        translateY: [-6, 6],
        direction: 'alternate',
        loop: true,
        duration: 1800,
        delay: stagger(200),
        ease: 'inOutQuad'
      });
    }

    // 2. Idle Mascot Breathing Animation
    if (mascotRef.current) {
      animate(mascotRef.current, {
        translateY: [-7, 5],
        rotate: [-3, 3],
        direction: 'alternate',
        loop: true,
        duration: 2000,
        ease: 'inOutSine'
      });
    }
  }, [sceneIndex]);

  // Particle burst helper on child click
  const triggerConfetti = (e) => {
    sound.playPop();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newParticles = Array.from({ length: 8 }, (_, i) => ({
      id: Date.now() + i,
      x,
      y,
      color: ['#fbbf24', '#ec4899', '#38bdf8', '#34d399', '#a855f7'][i % 5],
      symbol: ['⭐', '✨', '🎈', '🎉', '💎'][i % 5]
    }));

    setParticles((prev) => [...prev.slice(-16), ...newParticles]);
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => !newParticles.find((np) => np.id === p.id)));
    }, 900);

    onInteraction();
  };

  // Interactive Mascot Tap Reaction
  const handleMascotClick = (e) => {
    e.stopPropagation();
    sound.playMascotChirp();
    if (mascotRef.current) {
      animate(mascotRef.current, {
        scale: [1, 1.35, 0.95, 1],
        rotate: [0, 360],
        duration: 700,
        ease: 'outBack'
      });
    }
    setActiveInteractiveTip(`Yay! ${mascotName.split(' ')[0]} is so proud of your great listening! ⭐`);
    setTimeout(() => setActiveInteractiveTip(null), 3500);
  };

  return (
    <div
      ref={stageRef}
      style={{
        minHeight: '340px',
        borderRadius: 'var(--radius-lg)',
        background: 'radial-gradient(ellipse at 50% 20%, rgba(49, 46, 129, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
        border: '2px solid rgba(165, 180, 252, 0.35)',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5), inset 0 0 60px rgba(99, 102, 241, 0.15)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '24px',
        marginBottom: '24px',
        userSelect: 'none'
      }}
      onClick={triggerConfetti}
    >
      {/* Background Starfield Particles */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.25 }}>
        <div className="floating-sparkle" style={{ position: 'absolute', top: '15%', left: '8%', fontSize: '1.2rem' }}>✨</div>
        <div className="floating-sparkle" style={{ position: 'absolute', top: '25%', right: '12%', fontSize: '1.5rem' }}>🌟</div>
        <div className="floating-sparkle" style={{ position: 'absolute', bottom: '20%', left: '18%', fontSize: '1.1rem' }}>⭐</div>
        <div className="floating-sparkle" style={{ position: 'absolute', bottom: '15%', right: '22%', fontSize: '1.3rem' }}>💫</div>
      </div>

      {/* Floating Click Confetti */}
      {particles.map((p) => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}px`,
            top: `${p.y}px`,
            fontSize: '1.4rem',
            pointerEvents: 'none',
            zIndex: 15,
            animation: 'floatUpAndFade 0.85s forwards ease-out'
          }}
        >
          {p.symbol}
        </span>
      ))}

      {/* Top Banner: Scene Title & Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="badge badge-science" style={{ padding: '6px 14px', fontSize: '0.85rem', fontWeight: 700 }}>
            {subjectTag} · Scene {sceneIndex + 1}/{totalScenes}
          </span>
          <span style={{ fontSize: '0.85rem', color: '#c7d2fe', fontWeight: 600 }}>
            Interactive Video Studio 🎨
          </span>
        </div>

        {/* Live Narration Speaking Indicator */}
        {isSpeaking && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(236, 72, 153, 0.25)',
              border: '1px solid rgba(236, 72, 153, 0.5)',
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)'
            }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ec4899', animation: 'ping 1s infinite' }} />
            <span style={{ fontSize: '0.78rem', color: '#fbcfe8', fontWeight: 700 }}>Speaking Narration...</span>
          </div>
        )}
      </div>

      {/* Center Dynamic Visualizer based on Topic Concepts */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0', zIndex: 4 }}>
        {isComparison ? (
          /* Concept Visualizer 1: Comparison & Ascending/Descending Numbers */
          <div style={{ width: '100%', maxWidth: '780px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '18px', flexWrap: 'wrap' }}>
              {/* Left Number Card */}
              <div
                className="stage-card-bounce"
                onClick={(e) => {
                  e.stopPropagation();
                  sound.playBounce();
                  setActiveScaleTilt('left');
                }}
                style={{
                  padding: '16px 26px',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  borderRadius: '16px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  boxShadow: '0 8px 24px rgba(79, 70, 229, 0.45)',
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#e0e7ff', textTransform: 'uppercase', fontWeight: 700 }}>Number A</div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#ffffff', letterSpacing: '1px' }}>4,582</div>
                <div style={{ fontSize: '0.78rem', color: '#c7d2fe', marginTop: '4px' }}>4 Thousands, 5 Hundreds</div>
              </div>

              {/* Animated Symbol Operator */}
              <div
                className="stage-card-bounce"
                onClick={(e) => {
                  e.stopPropagation();
                  sound.playPop();
                  setActiveScaleTilt((prev) => (prev === 'left' ? 'equal' : prev === 'equal' ? 'right' : 'left'));
                }}
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #f59e0b, #ec4899)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2.2rem',
                  fontWeight: 900,
                  color: 'white',
                  boxShadow: '0 8px 20px rgba(236, 72, 153, 0.5)',
                  cursor: 'pointer',
                  animation: 'pulse 1.8s infinite'
                }}
                title="Tap to cycle comparison symbol"
              >
                {activeScaleTilt === 'left' ? '>' : activeScaleTilt === 'right' ? '<' : '='}
              </div>

              {/* Right Number Card */}
              <div
                className="stage-card-bounce"
                onClick={(e) => {
                  e.stopPropagation();
                  sound.playBounce();
                  setActiveScaleTilt('right');
                }}
                style={{
                  padding: '16px 26px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0d9488 100%)',
                  borderRadius: '16px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  boxShadow: '0 8px 24px rgba(2, 132, 199, 0.45)',
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: '0.75rem', color: '#ccfbf1', textTransform: 'uppercase', fontWeight: 700 }}>Number B</div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#ffffff', letterSpacing: '1px' }}>4,528</div>
                <div style={{ fontSize: '0.78rem', color: '#a7f3d0', marginTop: '4px' }}>4 Thousands, 5 Hundreds</div>
              </div>
            </div>

            {/* Ascending & Descending Visual Staircase */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', height: '80px', marginTop: '6px' }}>
              {[
                { val: '1,200', h: 32, col: '#818cf8', label: 'Start' },
                { val: '2,400', h: 48, col: '#a78bfa', label: 'Ascend' },
                { val: '3,600', h: 64, col: '#f472b6', label: 'Higher' },
                { val: '4,800', h: 80, col: '#fbbf24', label: 'Peak 🏆' }
              ].map((step, idx) => (
                <div
                  key={idx}
                  className="stage-card-bounce"
                  onClick={(e) => {
                    e.stopPropagation();
                    sound.playPop();
                  }}
                  style={{
                    width: '74px',
                    height: `${step.h}px`,
                    background: step.col,
                    borderRadius: '8px 8px 0 0',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 4px',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    transition: 'transform 0.15s ease'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scaleY(1.12)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scaleY(1)')}
                >
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#1e1b4b' }}>{step.val}</span>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#1e1b4b' }}>{step.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : isPlaceValue ? (
          /* Concept Visualizer 2: Place Value Building Blocks */
          <div style={{ width: '100%', maxWidth: '820px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
            <div style={{ fontSize: '0.9rem', color: '#c7d2fe', fontWeight: 600 }}>
              💡 Place Value Expansion · Click blocks to explore values:
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {[
                { name: 'Ten-Thousands', val: '30,000', digit: '3', col: 'linear-gradient(135deg, #7c3aed, #4f46e5)' },
                { name: 'Thousands', val: '6,000', digit: '6', col: 'linear-gradient(135deg, #2563eb, #0284c7)' },
                { name: 'Hundreds', val: '200', digit: '2', col: 'linear-gradient(135deg, #059669, #10b981)' },
                { name: 'Tens', val: '50', digit: '5', col: 'linear-gradient(135deg, #d97706, #f59e0b)' },
                { name: 'Ones', val: '4', digit: '4', col: 'linear-gradient(135deg, #db2777, #ec4899)' }
              ].map((pv, idx) => (
                <div
                  key={idx}
                  className="stage-card-bounce"
                  onClick={(e) => {
                    e.stopPropagation();
                    sound.playPop();
                    setActiveInteractiveTip(`${pv.digit} is in the ${pv.name} place, giving it a value of ${pv.val}!`);
                  }}
                  style={{
                    padding: '14px 18px',
                    borderRadius: '14px',
                    background: pv.col,
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.3)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    minWidth: '110px',
                    transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08) translateY(-4px)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1) translateY(0)')}
                >
                  <div style={{ fontSize: '2rem', fontWeight: 900, color: 'white' }}>{pv.digit}</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fef08a' }}>{pv.val}</div>
                  <div style={{ fontSize: '0.7rem', color: '#e0e7ff', marginTop: '2px', fontWeight: 600 }}>{pv.name}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fbbf24', letterSpacing: '1px' }}>
              Total: 36,254
            </div>
          </div>
        ) : isFractions ? (
          /* Concept Visualizer 3: Fractions & Proportions */
          <div style={{ display: 'flex', gap: '32px', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
            <div
              className="stage-card-bounce"
              onClick={(e) => {
                e.stopPropagation();
                sound.playPop();
                setActiveInteractiveTip('1/2 (One Half) is equal to 2/4 (Two Quarters)!');
              }}
              style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: 'conic-gradient(#ec4899 0% 50%, #4338ca 50% 100%)',
                boxShadow: '0 8px 24px rgba(236, 72, 153, 0.4)',
                border: '4px solid white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
                ½
              </span>
            </div>

            <div
              className="stage-card-bounce"
              onClick={(e) => {
                e.stopPropagation();
                sound.playPop();
                setActiveInteractiveTip('¾ means 3 parts out of 4 total equal pieces!');
              }}
              style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: 'conic-gradient(#f59e0b 0% 75%, #1e1b4b 75% 100%)',
                boxShadow: '0 8px 24px rgba(245, 158, 11, 0.4)',
                border: '4px solid white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'white', textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
                ¾
              </span>
            </div>
          </div>
        ) : isBricksGeometry ? (
          /* Concept Visualizer 4: Bricks & Geometry Symmetry */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['🧱', '🧱', '🧱', '🧱', '🧱'].map((b, i) => (
                <div key={i} className="stage-card-bounce" style={{ fontSize: '2.4rem', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.4))' }}>
                  {b}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '6px', marginLeft: '24px' }}>
              {['🧱', '🧱', '🧱', '🧱'].map((b, i) => (
                <div key={i} className="stage-card-bounce" style={{ fontSize: '2.4rem', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.4))' }}>
                  {b}
                </div>
              ))}
            </div>
            <div style={{ color: '#fed7aa', fontSize: '0.85rem', fontWeight: 600 }}>
              Alternating Brick Bond Pattern for Maximum Strength! 🏛️
            </div>
          </div>
        ) : (
          /* Concept Visualizer 5: Illustrated Discovery Constellation */
          <div style={{ display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
            {[
              { icon: '🌟', title: 'Key Concept', col: 'rgba(99, 102, 241, 0.4)' },
              { icon: '💡', title: 'Smart Rule', col: 'rgba(236, 72, 153, 0.4)' },
              { icon: '🚀', title: 'Real World', col: 'rgba(16, 185, 129, 0.4)' }
            ].map((card, i) => (
              <div
                key={i}
                className="stage-card-bounce"
                onClick={(e) => {
                  e.stopPropagation();
                  sound.playPop();
                  setActiveInteractiveTip(`Awesome discovery! Tap words below to collect your revision stars! ⭐`);
                }}
                style={{
                  width: '130px',
                  height: '130px',
                  borderRadius: '20px',
                  background: card.col,
                  backdropFilter: 'blur(12px)',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
                }}
              >
                <span style={{ fontSize: '2.5rem' }}>{card.icon}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'white' }}>{card.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Mascot Corner with Dialogue Bubble */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 6 }}>
        {/* Animated Mascot Character */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            ref={mascotRef}
            onClick={handleMascotClick}
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, #f59e0b, #ec4899)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2.4rem',
              boxShadow: '0 8px 24px rgba(236, 72, 153, 0.5)',
              cursor: 'pointer',
              border: '2px solid rgba(255,255,255,0.4)'
            }}
            title="Tap me for encouragement!"
          >
            {mascotEmoji}
          </div>

          {/* Dynamic Mascot Speech Bubble */}
          <div
            className="stage-card-bounce"
            style={{
              background: 'rgba(255, 255, 255, 0.95)',
              color: '#0f172a',
              padding: '8px 16px',
              borderRadius: '16px 16px 16px 4px',
              boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
              maxWidth: '360px',
              fontSize: '0.88rem',
              fontWeight: 700,
              lineHeight: '1.4'
            }}
          >
            {activeInteractiveTip || (
              isSpeaking
                ? '👂 Listening mode: Follow the glowing words below!'
                : '✨ Tip: Tap any card above or click glowing words to unlock stars!'
            )}
          </div>
        </div>

        {/* Scene Title in Stage */}
        <div style={{ textAlign: 'right' }}>
          <h3 style={{ fontSize: '1.25rem', color: '#ffffff', fontWeight: 800 }}>
            {scene?.title || 'Learning Adventure'}
          </h3>
          <p style={{ fontSize: '0.8rem', color: '#a5b4fc', marginTop: '2px' }}>
            Tap the stage elements to interact & explore! 👆
          </p>
        </div>
      </div>
    </div>
  );
}
