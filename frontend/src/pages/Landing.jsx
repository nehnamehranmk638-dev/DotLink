import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { animate, createTimeline } from 'animejs';
import { api } from '../api';

export default function Landing() {
  const navigate = useNavigate();
  const user = api.getUser();
  const activeChild = api.getActiveChild();
  const isRunningRef = useRef(false);

  const getTargetCoordinates = () => {
    const ropeEl = document.getElementById('ropeWrapper');
    if (!ropeEl) return 200;
    const rect = ropeEl.getBoundingClientRect();
    const crabWidth = window.innerWidth < 768 ? 190 : 230;
    return rect.left - crabWidth + 70;
  };

  const runPullAnimation = () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;

    const targetX = getTargetCoordinates();

    // Reset elements
    animate('#crab', { left: '-240px', translateY: 0, rotate: 0, duration: 0 });
    animate('#placardBanner', { top: '-650px', translateY: '-100%', rotate: -3, scale: 0.9, duration: 0 });
    animate('#ropeLine', { d: 'M 40 0 L 40 260', duration: 0 });
    animate('#ropeRingGroup', { translateY: 0, duration: 0 });
    animate('#rightClawGroup', { rotate: 0, translateY: 0, translateX: 0, duration: 0 });
    animate('#leftClawGroup', { rotate: 0, duration: 0 });

    const tl = createTimeline({
      ease: 'inOutQuad',
      onComplete: () => {
        isRunningRef.current = false;
      }
    });

    const steps = 10;
    const startX = -240;
    const distance = targetX - startX;

    for (let i = 0; i < steps; i++) {
      const currentX = startX + (distance * ((i + 1) / steps));
      tl.add('#crab', {
        left: `${currentX}px`,
        translateY: [0, -10, 0],
        rotate: i % 2 === 0 ? 3 : -3,
        duration: 180,
        ease: 'inOutSine'
      }, i === 0 ? 200 : '+=0');

      tl.add('#crabLegsLeft, #crabLegsRight', {
        rotate: i % 2 === 0 ? 5 : -5,
        duration: 90
      }, '-=180');
    }

    // Claw reach & rope pull
    tl.add('#crab', { rotate: 0, duration: 150 })
      .add('#rightClawGroup', { rotate: -70, translateY: -35, translateX: -15, duration: 400, ease: 'outBack' })
      .add('#crab', { translateY: -25, duration: 350 }, '-=350')
      .add('#ropeRingGroup', { translateY: 85, duration: 500, ease: 'inQuad' })
      .add('#ropeLine', { d: 'M 40 0 L 40 345', duration: 500, ease: 'inQuad' }, '-=500')
      .add('#crab', { translateY: 45, duration: 500, ease: 'inQuad' }, '-=500')
      .add('#rightEye, #leftEye', { scaleY: 0.6, duration: 250 }, '-=350')
      .add('#ropeRingGroup', { translateY: [85, -15, 0], duration: 650, ease: 'outElastic(1, 0.4)' })
      .add('#ropeLine', {
        d: [
          { value: 'M 40 0 L 40 345' },
          { value: 'M 40 0 L 40 245' },
          { value: 'M 40 0 L 40 260' }
        ],
        duration: 650,
        ease: 'outElastic(1, 0.4)'
      }, '-=650')
      .add('#rightEye, #leftEye', { scaleY: 1, duration: 200 }, '-=500')
      .add('#rightClawGroup', { rotate: 0, translateY: 0, translateX: 0, duration: 400, ease: 'outBack' }, '-=400')
      .add('#crab', { translateY: 0, duration: 400 }, '-=400')
      .add('#placardBanner', {
        top: '46%',
        translateY: '-50%',
        rotate: [-3, 0],
        scale: [0.85, 1],
        duration: 1100,
        ease: 'outElastic(1, 0.5)'
      }, '-=450')
      .add('#crab', { translateY: [0, -15, 0], duration: 500, ease: 'inOutQuad' }, '-=300')
      .add('#leftClawGroup, #rightClawGroup', { rotate: [0, -25, 25, 0], duration: 600 }, '-=500');
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      runPullAnimation();
    }, 350);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{
      backgroundColor: '#FFF8D6',
      minHeight: '100vh',
      width: '100vw',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      userSelect: 'none',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Paper Dots Texture */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'radial-gradient(#d3c180 0.8px, transparent 0.8px)',
        backgroundSize: '14px 14px',
        opacity: 0.25,
        pointerEvents: 'none',
        zIndex: 0
      }} />

      {/* Top Navigation Bar */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '24px',
        right: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.8rem' }}>✨</span>
          <span style={{ fontWeight: 900, color: '#33508A', fontSize: '1.3rem', letterSpacing: '0.05em' }}>DotLink</span>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          {user ? (
            <>
              <button
                onClick={() => navigate('/dashboard')}
                className="btn btn-primary"
                style={{ background: '#45335d', color: 'white', borderRadius: '9999px', padding: '10px 20px', fontWeight: 700 }}
              >
                👨‍👩‍👧 Parent Hub
              </button>
              <button
                onClick={() => navigate('/play')}
                className="btn btn-secondary"
                style={{ background: '#658d68', color: 'white', border: 'none', borderRadius: '9999px', padding: '10px 20px', fontWeight: 700 }}
              >
                🎒 Kids Space
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate('/login')}
              className="btn btn-primary"
              style={{ background: '#45335d', color: 'white', borderRadius: '9999px', padding: '10px 24px', fontWeight: 800 }}
            >
              Log In / Register →
            </button>
          )}
        </div>
      </div>

      {/* HANGING ROPE MECHANISM */}
      <div
        id="ropeWrapper"
        onClick={runPullAnimation}
        style={{
          position: 'absolute',
          top: 0,
          right: '26%',
          zIndex: 30,
          cursor: 'pointer'
        }}
      >
        <svg width="80" height="420" viewBox="0 0 80 420" style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="ropeTex" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8C6212" />
              <stop offset="30%" stopColor="#D9A84E" />
              <stop offset="70%" stopColor="#F2C975" />
              <stop offset="100%" stopColor="#734F0A" />
            </linearGradient>
            <filter id="shadow" x="-30%" y="-20%" width="160%" height="150%">
              <feDropShadow dx="3" dy="5" stdDeviation="3" floodOpacity="0.3" />
            </filter>
          </defs>

          {/* Vertical Rope Line */}
          <path id="ropeLine" d="M 40 0 L 40 260" stroke="url(#ropeTex)" strokeWidth="12" strokeLinecap="round" filter="url(#shadow)" />

          {/* Rope Ring Handle at Bottom */}
          <g id="ropeRingGroup" transform="translate(0, 260)">
            <circle cx="40" cy="30" r="24" fill="none" stroke="#9A6218" strokeWidth="10" filter="url(#shadow)" />
            <circle cx="40" cy="30" r="24" fill="none" stroke="#E6B35C" strokeWidth="5" />
            <circle cx="40" cy="30" r="16" fill="none" stroke="#523207" strokeWidth="2" />
            <rect x="32" y="-4" width="16" height="12" rx="4" fill="#6B430B" />
          </g>
        </svg>
      </div>

      {/* PLACARD / BANNER POSTER (DOT LINK BY SNAPSHOT) */}
      <div
        id="placardBanner"
        style={{
          position: 'absolute',
          zIndex: 20,
          top: '-650px',
          width: '92%',
          maxWidth: '820px',
          backgroundColor: '#A3D5E4',
          border: '6px solid #FFFFFF',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), inset 0 0 15px rgba(255, 255, 255, 0.5)',
          borderRadius: '16px',
          padding: '28px 24px',
          textAlign: 'center',
          transform: 'translateY(-100%)'
        }}
      >
        <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          
          {/* Main Letter Cutouts Container */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '14px', margin: '14px 0' }}>
            {/* Word: DOT */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginRight: '16px' }}>
              <div className="cutout-d" style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 900, color: '#152C70', background: '#E83E8C', border: '4px solid #FFD100', boxShadow: '3px 4px 0px rgba(0,0,0,0.2)', transform: 'rotate(-6deg)', fontSize: '3.6rem', padding: '10px 18px', borderRadius: '12px' }}>D</div>
              <div className="cutout-o" style={{ fontFamily: 'Fredoka, sans-serif', fontWeight: 700, color: '#E8125C', background: '#FFFFFF', border: '4px solid #E8125C', borderRadius: '50%', boxShadow: '2px 3px 0px rgba(0,0,0,0.15)', transform: 'rotate(2deg)', fontSize: '3.6rem', padding: '10px 18px' }}>O</div>
              <div className="cutout-t" style={{ fontFamily: 'Playfair Display, serif', fontWeight: 900, color: '#1B4D3E', background: '#F3E5AB', border: '3px solid #1B4D3E', boxShadow: '3px 4px 0px rgba(0,0,0,0.2)', transform: 'rotate(-2deg)', fontSize: '3.6rem', padding: '10px 18px', borderRadius: '10px' }}>T</div>
            </div>

            {/* Word: Link */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="cutout-l" style={{ fontFamily: 'Alfa Slab One, cursive', color: '#123B70', background: '#F8D882', border: '4px solid #FFFFFF', boxShadow: '3px 4px 0px rgba(0,0,0,0.2)', transform: 'rotate(4deg)', fontSize: '3.6rem', padding: '10px 18px', borderRadius: '12px' }}>L</div>
              <div className="cutout-i" style={{ fontFamily: 'Shrikhand, cursive', color: '#0F172A', background: '#D9EFFC', border: '3px solid #FFFFFF', boxShadow: '2px 3px 0px rgba(0,0,0,0.15)', transform: 'rotate(-5deg)', fontSize: '3.6rem', padding: '8px 16px', borderRadius: '10px' }}>i</div>
              <div className="cutout-n" style={{ fontFamily: 'Cinzel, serif', fontWeight: 900, color: '#7A0A26', background: '#EAC2C8', border: '3px solid #FFFFFF', boxShadow: '3px 3px 0px rgba(0,0,0,0.2)', transform: 'rotate(3deg)', fontSize: '3.6rem', padding: '10px 18px', borderRadius: '12px' }}>N</div>
              <div className="cutout-k" style={{ fontFamily: 'Caveat, cursive', fontWeight: 700, color: '#7B003F', background: '#FAD02C', border: '4px solid #FFFFFF', boxShadow: '4px 5px 0px rgba(0,0,0,0.2)', transform: 'rotate(-8deg)', fontSize: '4.2rem', padding: '8px 16px', borderRadius: '12px' }}>k</div>
            </div>
          </div>

          {/* Subtitle */}
          <div style={{ marginTop: '16px', fontWeight: 900, fontSize: '1.8rem', color: '#33508A', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            BY SNAPSHOT
          </div>

          {/* Log In / Register Action Button */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '22px', marginBottom: '8px', position: 'relative', zIndex: 10 }}>
            <button
              onClick={() => navigate(user ? '/dashboard' : '/login')}
              style={{
                backgroundColor: '#45335d',
                color: 'white',
                border: '3.5px solid white',
                borderRadius: '9999px',
                padding: '12px 38px',
                fontWeight: 800,
                fontSize: '1.25rem',
                cursor: 'pointer',
                boxShadow: '0 8px 18px rgba(0,0,0,0.22)',
                transition: 'transform 0.15s, background-color 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#5c437a';
                e.currentTarget.style.transform = 'scale(1.03)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#45335d';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = 'scale(0.97)';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'scale(1.03)';
              }}
            >
              <span>{user ? 'Go to Parent Hub →' : 'Log In / Register →'}</span>
            </button>
          </div>

          {/* Swan Cutout (Lower Left) */}
          <div style={{ position: 'absolute', bottom: '-12px', left: '10px', width: '90px', transform: 'rotate(-3deg)', filter: 'drop-shadow(0px 8px 12px rgba(0, 0, 0, 0.2))' }}>
            <svg viewBox="0 0 160 140" style={{ width: '100%', height: 'auto' }}>
              <path d="M 20 120 C 10 90, 30 60, 60 45 C 70 30, 80 15, 95 8 C 105 4, 115 8, 112 20 C 108 28, 96 38, 88 52 C 120 52, 145 75, 138 108 C 130 130, 80 135, 20 120 Z" fill="#FFFFFF" stroke="#CBD5E1" strokeWidth="5" strokeLinejoin="round" />
              <path d="M 25 115 C 15 88, 33 60, 62 47 C 72 32, 82 17, 96 10 C 102 7, 110 10, 108 20 C 104 27, 94 36, 86 50 C 118 50, 140 72, 133 103 C 126 123, 78 128, 25 115 Z" fill="#F8FAFC" />
              <polygon points="108,16 124,20 110,25" fill="#F97316" />
              <circle cx="102" cy="17" r="2.5" fill="#0F172A" />
              <path d="M 50 95 C 70 75, 100 75, 115 100" fill="none" stroke="#E2E8F0" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>

          {/* Starfish Cutout (Lower Right) */}
          <div style={{ position: 'absolute', bottom: '-12px', right: '10px', width: '90px', transform: 'rotate(6deg)', filter: 'drop-shadow(0px 8px 12px rgba(0, 0, 0, 0.2))' }}>
            <svg viewBox="0 0 140 140" style={{ width: '100%', height: 'auto' }}>
              <path d="M 70 8 L 88 48 L 130 48 L 96 74 L 108 116 L 70 90 L 32 116 L 44 74 L 10 48 L 52 48 Z" fill="#8B5CF6" stroke="#06B6D4" strokeWidth="7" strokeLinejoin="round" />
              <path d="M 70 16 L 85 50 L 122 50 L 92 72 L 103 108 L 70 86 L 37 108 L 48 72 L 18 50 L 55 50 Z" fill="#DC2626" />
              <circle cx="70" cy="42" r="2.5" fill="#FDE047" />
              <circle cx="70" cy="64" r="3.5" fill="#FDE047" />
              <circle cx="54" cy="62" r="2.5" fill="#FDE047" />
              <circle cx="86" cy="62" r="2.5" fill="#FDE047" />
              <circle cx="70" cy="80" r="2.5" fill="#FDE047" />
            </svg>
          </div>

        </div>
      </div>

      {/* CUTE CRAB CHARACTER */}
      <div
        id="crab"
        onClick={runPullAnimation}
        style={{
          position: 'absolute',
          bottom: '24px',
          left: '-240px',
          zIndex: 40,
          width: '210px',
          cursor: 'pointer',
          filter: 'drop-shadow(0px 8px 12px rgba(0, 0, 0, 0.2))'
        }}
      >
        <svg viewBox="0 0 300 240" style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
          <defs>
            <radialGradient id="crabGrad" cx="50%" cy="40%" r="55%">
              <stop offset="0%" stopColor="#FF92A4" />
              <stop offset="65%" stopColor="#FF5268" />
              <stop offset="100%" stopColor="#E52E45" />
            </radialGradient>
            <radialGradient id="blush" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FF2A55" stopOpacity="0.65" />
              <stop offset="100%" stopColor="#FF2A55" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* LEGS */}
          <g id="crabLegsLeft">
            <path d="M 85 150 C 55 150, 35 165, 40 185 C 43 195, 55 190, 60 175 C 65 165, 85 160, 90 158" fill="#E52E45" />
            <path d="M 90 165 C 60 175, 45 195, 55 212 C 60 220, 70 210, 73 198 C 77 185, 95 175, 97 170" fill="#E52E45" />
            <path d="M 105 180 C 80 200, 70 218, 83 232 C 90 238, 97 228, 97 215 C 98 200, 113 188, 115 183" fill="#E52E45" />
          </g>

          <g id="crabLegsRight">
            <path d="M 215 150 C 245 150, 265 165, 260 185 C 257 195, 245 190, 240 175 C 235 165, 215 160, 210 158" fill="#E52E45" />
            <path d="M 210 165 C 240 175, 255 195, 245 212 C 240 220, 230 210, 227 198 C 223 185, 205 175, 203 170" fill="#E52E45" />
            <path d="M 195 180 C 220 200, 230 218, 217 232 C 210 238, 203 228, 203 215 C 202 200, 187 188, 185 183" fill="#E52E45" />
          </g>

          {/* LEFT CLAW */}
          <g id="leftClawGroup" style={{ transformOrigin: '80px 120px' }}>
            <path d="M 90 135 Q 65 110 70 85" stroke="#E52E45" strokeWidth="18" strokeLinecap="round" fill="none" />
            <path d="M 35 70 C 15 50, 20 15, 50 20 C 65 23, 70 40, 60 55 C 75 35, 95 45, 85 70 C 75 90, 45 85, 35 70 Z" fill="#FF5268" />
            <ellipse cx="40" cy="35" rx="5" ry="9" fill="#FFFFFF" opacity="0.6" transform="rotate(-20 40 35)" />
            <g transform="translate(62, 50) scale(0.85)">
              <circle cx="-7" cy="-4" r="6" fill="#FFFBEB" />
              <circle cx="7" cy="-4" r="6" fill="#FFFBEB" />
              <circle cx="8" cy="6" r="6" fill="#FFFBEB" />
              <circle cx="-3" cy="10" r="6" fill="#FFFBEB" />
              <circle cx="-10" cy="4" r="6" fill="#FFFBEB" />
              <circle cx="0" cy="2" r="4" fill="#421422" />
            </g>
          </g>

          {/* RIGHT CLAW */}
          <g id="rightClawGroup" style={{ transformOrigin: '220px 120px' }}>
            <path d="M 210 135 Q 235 110 230 85" stroke="#E52E45" strokeWidth="18" strokeLinecap="round" fill="none" />
            <path d="M 265 70 C 285 50, 280 15, 250 20 C 235 23, 230 40, 240 55 C 225 35, 205 45, 215 70 C 225 90, 255 85, 265 70 Z" fill="#FF5268" />
            <ellipse cx="260" cy="35" rx="6" ry="10" fill="#FFFFFF" opacity="0.6" transform="rotate(20 260 35)" />
            <g transform="translate(212, 60) scale(0.85)">
              <circle cx="-7" cy="-4" r="6" fill="#FFFBEB" />
              <circle cx="7" cy="-4" r="6" fill="#FFFBEB" />
              <circle cx="8" cy="6" r="6" fill="#FFFBEB" />
              <circle cx="-3" cy="10" r="6" fill="#FFFBEB" />
              <circle cx="-10" cy="4" r="6" fill="#FFFBEB" />
              <circle cx="0" cy="2" r="4" fill="#421422" />
            </g>
          </g>

          {/* MAIN BODY */}
          <ellipse cx="150" cy="150" rx="78" ry="52" fill="url(#crabGrad)" />
          <ellipse cx="102" cy="162" rx="20" ry="11" fill="url(#blush)" />
          <ellipse cx="198" cy="162" rx="20" ry="11" fill="url(#blush)" />

          {/* EYES */}
          <g id="leftEye">
            <ellipse cx="118" cy="112" rx="30" ry="36" fill="#FFFFFF" />
            <ellipse cx="120" cy="112" rx="26" ry="31" fill="#240711" />
            <ellipse cx="112" cy="98" rx="11" ry="15" fill="#FFFFFF" transform="rotate(-15 112 98)" />
            <circle cx="130" cy="128" r="4.5" fill="#FFFFFF" />
          </g>

          <g id="rightEye">
            <ellipse cx="182" cy="112" rx="30" ry="36" fill="#FFFFFF" />
            <ellipse cx="180" cy="112" rx="26" ry="31" fill="#240711" />
            <ellipse cx="172" cy="98" rx="11" ry="15" fill="#FFFFFF" transform="rotate(-15 172 98)" />
            <circle cx="190" cy="128" r="4.5" fill="#FFFFFF" />
          </g>

          <path d="M 142 152 Q 150 163 158 152" stroke="#240711" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        </svg>
      </div>

    </div>
  );
}
