import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { animate } from 'animejs';
import { api } from '../../api';

export default function Login({ initialSignUp = false }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine mode from prop or query param
  const queryParams = new URLSearchParams(location.search);
  const modeParam = queryParams.get('mode');
  const [isSignUp, setIsSignUp] = useState(initialSignUp || modeParam === 'signup' || location.pathname === '/signup');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState(8);
  const [childGrade, setChildGrade] = useState('4');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const bubblesContainerRef = useRef(null);

  // Initialize anime.js animations
  useEffect(() => {
    // 1. Generate floating bubbles
    const container = bubblesContainerRef.current;
    if (container) {
      container.innerHTML = '';
      const bubbleCount = 16;
      for (let i = 0; i < bubbleCount; i++) {
        const bubble = document.createElement('div');
        const size = Math.random() * 36 + 12;
        const leftPos = Math.random() * 100;

        bubble.style.position = 'absolute';
        bubble.style.width = `${size}px`;
        bubble.style.height = `${size}px`;
        bubble.style.left = `${leftPos}%`;
        bubble.style.bottom = '-60px';
        bubble.style.borderRadius = '50%';
        bubble.style.background = 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.25))';
        bubble.style.border = '1px solid rgba(255, 255, 255, 0.45)';
        bubble.style.pointerEvents = 'none';

        container.appendChild(bubble);

        animate(bubble, {
          translateY: [0, -window.innerHeight - 150],
          translateX: [
            { value: -15, duration: 1500, ease: 'inOutSine' },
            { value: 15, duration: 1500, ease: 'inOutSine' },
            { value: -15, duration: 1500, ease: 'inOutSine' }
          ],
          opacity: [
            { value: 0, duration: 400 },
            { value: 0.75, duration: 1000 },
            { value: 0, duration: 2000, delay: Math.random() * 3000 + 2000 }
          ],
          loop: true,
          direction: 'alternate',
          ease: 'linear',
          delay: Math.random() * 4000
        });
      }
    }

    // 2. Main card entrance animation
    animate('#main-auth-card', {
      translateY: [40, 0],
      opacity: [0, 1],
      scale: [0.96, 1],
      duration: 1000,
      ease: 'outBack'
    });

    // 3. Gentle continuous waving for crab claw
    animate('#waving-claw', {
      rotate: [0, 25, -10, 20, -5, 0],
      duration: 2500,
      loop: true,
      ease: 'inOutSine'
    });

    // 4. Crab gentle float / bobbing
    animate('#crab-container', {
      translateY: [-3, 3],
      rotate: [-1, 1],
      direction: 'alternate',
      loop: true,
      duration: 2800,
      ease: 'inOutSine'
    });
  }, [isSignUp]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        if (!childName.trim()) {
          setError("Please provide your child's name.");
          setLoading(false);
          return;
        }

        // 1. Sign up parent account
        const parentName = `${childName.trim()}'s Parent`;
        await api.signup(parentName, email, password, true);

        // 2. Parse grade (map pre-k, kindergarten, or other to 1..12)
        let mappedGrade = 1;
        if (childGrade === 'pre-k' || childGrade === 'kindergarten' || childGrade === 'other') {
          mappedGrade = 1;
        } else {
          mappedGrade = parseInt(childGrade, 10) || 1;
        }

        // 3. Create child profile in same flow
        const kid = await api.createChild({
          name: childName.trim(),
          age: Number(childAge) || 8,
          grade: mappedGrade,
          mascot_name: 'Barnaby the Crab'
        });
        api.setActiveChild(kid);
      } else {
        await api.login(email, password);
        // Load children and set active child if needed
        try {
          const kids = await api.getChildren();
          if (kids && kids.length > 0) {
            api.setActiveChild(kids[0]);
          }
        } catch (_) {}
      }

      // Navigate to Parent Hub
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Reusable Crab Mascot SVG Component
  const CrabMascot = () => (
    <svg width="200" height="150" viewBox="0 0 200 150" className="overflow-visible">
      {/* Back Legs (Left) */}
      <path d="M 40 100 C 20 105, 10 120, 25 135" fill="none" stroke="#FF7675" strokeWidth="8" strokeLinecap="round" />
      <path d="M 50 115 C 30 125, 25 140, 40 145" fill="none" stroke="#FF7675" strokeWidth="8" strokeLinecap="round" />

      {/* Back Legs (Right) */}
      <path d="M 160 100 C 180 105, 190 120, 175 135" fill="none" stroke="#FF7675" strokeWidth="8" strokeLinecap="round" />
      <path d="M 150 115 C 170 125, 175 140, 160 145" fill="none" stroke="#FF7675" strokeWidth="8" strokeLinecap="round" />

      {/* Left Claw (Resting cute) */}
      <g transform="translate(-5, 5)">
        <path d="M 60 90 Q 40 60 25 70" fill="none" stroke="#FF7675" strokeWidth="10" strokeLinecap="round" />
        <circle cx="20" cy="75" r="16" fill="#FF7675" />
        <circle cx="12" cy="65" r="10" fill="#FF7675" />
      </g>

      {/* Right Claw (Waving - controlled by anime.js) */}
      <g id="waving-claw" style={{ transformOrigin: '160px 90px' }}>
        <path d="M 140 90 Q 170 60 175 50" fill="none" stroke="#FF7675" strokeWidth="10" strokeLinecap="round" />
        <circle cx="178" cy="45" r="18" fill="#FF7675" />
        <circle cx="165" cy="32" r="12" fill="#FF7675" />
      </g>

      {/* Main Body */}
      <ellipse cx="100" cy="100" rx="75" ry="55" fill="#FF8C8C" />
      <ellipse cx="100" cy="110" rx="60" ry="40" fill="#FFA6A6" />

      {/* Left Eye */}
      <circle cx="65" cy="85" r="20" fill="#2d3436" />
      <circle cx="72" cy="78" r="8" fill="#ffffff" />
      <circle cx="58" cy="92" r="3" fill="#ffffff" />

      {/* Right Eye */}
      <circle cx="135" cy="85" r="20" fill="#2d3436" />
      <circle cx="142" cy="78" r="8" fill="#ffffff" />
      <circle cx="128" cy="92" r="3" fill="#ffffff" />

      {/* Rosy Cheeks */}
      <ellipse cx="40" cy="105" rx="14" ry="8" fill="#FF4757" opacity="0.35" />
      <ellipse cx="160" cy="105" rx="14" ry="8" fill="#FF4757" opacity="0.35" />

      {/* Tiny Sweet Smile */}
      <path d="M 92 105 Q 100 112 108 105" fill="none" stroke="#2d3436" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );

  return (
    <div
      style={{
        fontFamily: "'Baloo 2', sans-serif",
        backgroundColor: '#a9ba7d', // Soothing olive green
        minHeight: '100vh',
        margin: 0,
        padding: '24px 16px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflowX: 'hidden',
        position: 'relative'
      }}
    >
      {/* Floating Bubbles Container */}
      <div
        ref={bubblesContainerRef}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          overflow: 'hidden',
          pointerEvents: 'none'
        }}
      />

      {/* Back to Home Link */}
      <div style={{ position: 'absolute', top: '20px', left: '24px', zIndex: 30 }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'rgba(255, 255, 255, 0.85)',
            border: '2px solid white',
            borderRadius: '9999px',
            padding: '8px 18px',
            color: '#4a315d',
            fontWeight: 700,
            fontSize: '15px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          ← Home
        </button>
      </div>

      {/* Main Auth Container */}
      <div
        id="main-auth-card"
        style={{
          width: '100%',
          maxWidth: isSignUp ? 'min(1100px, 94vw)' : 'min(980px, 94vw)',
          position: 'relative',
          zIndex: 10
        }}
      >
        {!isSignUp ? (
          /* ==============================================================
             SIGN IN VIEW (Template 1: Join - ADHD Kids App)
             ============================================================== */
          <div className="flex flex-col items-center mt-6 sm:mt-4">
            {/* Peeking Crab Mascot */}
            <div id="crab-container" className="relative z-20 -mb-6 drop-shadow-xl">
              <CrabMascot />
            </div>

            {/* Main Outer Card (Pastel Purple) */}
            <div
              style={{
                width: '100%',
                backgroundColor: '#c3a8eb',
                borderRadius: '40px',
                padding: '12px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
                position: 'relative',
                zIndex: 10
              }}
            >
              {/* Inner White Content Area */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '32px',
                  padding: '36px 32px',
                  boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.05)'
                }}
                className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-14 items-center"
              >
                {/* Left Column: Heading */}
                <div className="text-center md:text-left md:pr-4">
                  <h1
                    style={{
                      color: '#4a315d',
                      fontSize: 'clamp(28px, 4vw, 44px)',
                      fontWeight: 800,
                      lineHeight: 1.18,
                      letterSpacing: '-0.5px',
                      margin: 0
                    }}
                  >
                    Sign in and follow your little learner’s journey
                  </h1>
                </div>

                {/* Right Column: Form */}
                <div className="flex flex-col gap-6 md:border-l-2 md:border-gray-200 md:pl-12">
                  {error && (
                    <div
                      style={{
                        backgroundColor: '#ffe4e6',
                        border: '2px solid #fecdd3',
                        color: '#9f1239',
                        padding: '12px 18px',
                        borderRadius: '16px',
                        fontWeight: 700,
                        fontSize: '15px'
                      }}
                    >
                      ⚠️ {error}
                    </div>
                  )}

                  <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
                    {/* Email Field */}
                    <div className="flex flex-col text-left gap-1.5">
                      <label htmlFor="email" style={{ color: '#4a315d', fontWeight: 700, fontSize: '15px', marginLeft: '16px' }}>
                        Parent Email Address
                      </label>
                      <input
                        type="email"
                        id="email"
                        placeholder="parent@example.com"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={{
                          backgroundColor: '#ffffff',
                          border: '2px solid #e2e8f0',
                          borderRadius: '9999px',
                          padding: '14px 24px',
                          color: '#4a315d',
                          fontWeight: 600,
                          fontSize: '17px',
                          outline: 'none',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                          transition: 'all 0.2s'
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#6A9C78';
                          e.target.style.boxShadow = '0 0 0 4px rgba(106, 156, 120, 0.2)';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e2e8f0';
                          e.target.style.boxShadow = 'none';
                        }}
                      />
                    </div>

                    {/* Password Field */}
                    <div className="flex flex-col text-left gap-1.5">
                      <label htmlFor="password" style={{ color: '#4a315d', fontWeight: 700, fontSize: '15px', marginLeft: '16px' }}>
                        Password
                      </label>
                      <input
                        type="password"
                        id="password"
                        placeholder="••••••••••••"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{
                          backgroundColor: '#ffffff',
                          border: '2px solid #e2e8f0',
                          borderRadius: '9999px',
                          padding: '14px 24px',
                          color: '#4a315d',
                          fontWeight: 700,
                          fontSize: '18px',
                          outline: 'none',
                          letterSpacing: '0.15em',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                          transition: 'all 0.2s'
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = '#6A9C78';
                          e.target.style.boxShadow = '0 0 0 4px rgba(106, 156, 120, 0.2)';
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = '#e2e8f0';
                          e.target.style.boxShadow = 'none';
                        }}
                      />
                    </div>

                    {/* Submit Button */}
                    <button
                      id="signin-btn"
                      type="submit"
                      disabled={loading}
                      style={{
                        backgroundColor: '#6A9C78',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: '20px',
                        borderRadius: '9999px',
                        padding: '15px 24px',
                        boxShadow: '0 6px 0 #4c7a57',
                        border: 'none',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px',
                        marginTop: '14px',
                        marginBottom: '8px',
                        transition: 'transform 0.1s, background-color 0.2s'
                      }}
                      onMouseDown={(e) => {
                        e.currentTarget.style.transform = 'translateY(4px)';
                        e.currentTarget.style.boxShadow = '0 2px 0 #4c7a57';
                      }}
                      onMouseUp={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 6px 0 #4c7a57';
                      }}
                    >
                      <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      {loading ? 'Signing In...' : 'Sign In to Parent Account'}
                    </button>
                  </form>

                  {/* Footer link to switch to Sign Up */}
                  <div
                    className="flex flex-col sm:flex-row items-center justify-center text-[16px] font-semibold"
                    style={{ marginTop: '28px', gap: '8px' }}
                  >
                    <span style={{ color: '#6b7280' }}>Don't have an account yet?</span>
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setIsSignUp(true);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#6A9C78',
                        fontWeight: 700,
                        textDecoration: 'underline',
                        textUnderlineOffset: '4px',
                        cursor: 'pointer',
                        fontSize: '16px',
                        padding: 0
                      }}
                    >
                      Create Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ==============================================================
             SIGN UP VIEW (Template 2: Sign Up - ADHD Kids App)
             ============================================================== */
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '40px',
              boxShadow: '0 20px 45px rgba(0,0,0,0.18)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'row',
              flexWrap: 'wrap',
              border: '4px solid #c3a8eb'
            }}
          >
            {/* Left Column: Mascot & Welcome */}
            <div
              style={{
                backgroundColor: '#c3a8eb',
                flex: '1 1 340px',
                padding: '40px 32px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                position: 'relative'
              }}
            >
              <div id="crab-container" className="drop-shadow-xl mb-4">
                <CrabMascot />
              </div>
              <h2
                style={{
                  color: '#4a315d',
                  fontSize: '28px',
                  fontWeight: 800,
                  lineHeight: 1.2,
                  marginTop: '12px'
                }}
              >
                Join us and follow your little learner's journey
              </h2>
              <p
                style={{
                  color: 'rgba(74, 49, 93, 0.85)',
                  fontWeight: 600,
                  fontSize: '16px',
                  marginTop: '12px',
                  maxWidth: '320px'
                }}
              >
                Set up a parent account to track focus, upload curriculum textbooks, and celebrate milestones!
              </p>
            </div>

            {/* Right Column: Sign Up Form */}
            <div
              style={{
                backgroundColor: '#ffffff',
                flex: '2 1 450px',
                padding: '40px 36px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}
            >
              <div style={{ marginBottom: '24px', textAlign: 'left' }}>
                <h1 style={{ color: '#4a315d', fontSize: '34px', fontWeight: 800, margin: '0 0 6px 0' }}>
                  Create Account
                </h1>
                <p style={{ color: '#6b7280', fontWeight: 600, fontSize: '17px', margin: 0 }}>
                  Please fill in the parent and child details below.
                </p>
              </div>

              {error && (
                <div
                  style={{
                    backgroundColor: '#ffe4e6',
                    border: '2px solid #fecdd3',
                    color: '#9f1239',
                    padding: '12px 18px',
                    borderRadius: '16px',
                    fontWeight: 700,
                    fontSize: '15px',
                    marginBottom: '20px'
                  }}
                >
                  ⚠️ {error}
                </div>
              )}

              <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
                {/* Email + Password Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col text-left gap-1">
                    <label style={{ color: '#4a315d', fontWeight: 700, fontSize: '15px', marginLeft: '12px' }}>
                      Parent Email Address
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="parent@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={{
                        backgroundColor: '#f9fafb',
                        border: '2px solid #e2e8f0',
                        borderRadius: '9999px',
                        padding: '13px 20px',
                        color: '#4a315d',
                        fontWeight: 600,
                        fontSize: '16px',
                        outline: 'none',
                        transition: 'all 0.2s'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#6A9C78';
                        e.target.style.backgroundColor = '#ffffff';
                        e.target.style.boxShadow = '0 0 0 4px rgba(106, 156, 120, 0.15)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0';
                        e.target.style.backgroundColor = '#f9fafb';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </div>

                  <div className="flex flex-col text-left gap-1">
                    <label style={{ color: '#4a315d', fontWeight: 700, fontSize: '15px', marginLeft: '12px' }}>
                      Password (min 6)
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{
                        backgroundColor: '#f9fafb',
                        border: '2px solid #e2e8f0',
                        borderRadius: '9999px',
                        padding: '13px 20px',
                        color: '#4a315d',
                        fontWeight: 700,
                        fontSize: '16px',
                        outline: 'none',
                        letterSpacing: '0.15em',
                        transition: 'all 0.2s'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#6A9C78';
                        e.target.style.backgroundColor = '#ffffff';
                        e.target.style.boxShadow = '0 0 0 4px rgba(106, 156, 120, 0.15)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0';
                        e.target.style.backgroundColor = '#f9fafb';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </div>
                </div>

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '6px 0' }}>
                  <div style={{ height: '1px', backgroundColor: '#e2e8f0', flex: 1 }} />
                  <span style={{ color: '#9ca3af', fontWeight: 800, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Child's Details
                  </span>
                  <div style={{ height: '1px', backgroundColor: '#e2e8f0', flex: 1 }} />
                </div>

                {/* Child Name, Age, Grade */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.4fr_0.8fr_1.1fr] gap-4">
                  <div className="flex flex-col text-left gap-1 sm:col-span-2 lg:col-span-1">
                    <label style={{ color: '#4a315d', fontWeight: 700, fontSize: '15px', marginLeft: '12px' }}>
                      Child's Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Alex"
                      value={childName}
                      onChange={(e) => setChildName(e.target.value)}
                      style={{
                        backgroundColor: '#f9fafb',
                        border: '2px solid #e2e8f0',
                        borderRadius: '9999px',
                        padding: '13px 20px',
                        color: '#4a315d',
                        fontWeight: 600,
                        fontSize: '16px',
                        outline: 'none',
                        transition: 'all 0.2s'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#6A9C78';
                        e.target.style.backgroundColor = '#ffffff';
                        e.target.style.boxShadow = '0 0 0 4px rgba(106, 156, 120, 0.15)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0';
                        e.target.style.backgroundColor = '#f9fafb';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </div>

                  <div className="flex flex-col text-left gap-1">
                    <label style={{ color: '#4a315d', fontWeight: 700, fontSize: '15px', marginLeft: '12px' }}>
                      Age
                    </label>
                    <input
                      type="number"
                      min="3"
                      max="18"
                      required
                      placeholder="8"
                      value={childAge}
                      onChange={(e) => setChildAge(e.target.value)}
                      style={{
                        backgroundColor: '#f9fafb',
                        border: '2px solid #e2e8f0',
                        borderRadius: '9999px',
                        padding: '13px 20px',
                        color: '#4a315d',
                        fontWeight: 600,
                        fontSize: '16px',
                        outline: 'none',
                        transition: 'all 0.2s'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#6A9C78';
                        e.target.style.backgroundColor = '#ffffff';
                        e.target.style.boxShadow = '0 0 0 4px rgba(106, 156, 120, 0.15)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0';
                        e.target.style.backgroundColor = '#f9fafb';
                        e.target.style.boxShadow = 'none';
                      }}
                    />
                  </div>

                  <div className="flex flex-col text-left gap-1">
                    <label style={{ color: '#4a315d', fontWeight: 700, fontSize: '15px', marginLeft: '12px' }}>
                      Grade
                    </label>
                    <select
                      value={childGrade}
                      onChange={(e) => setChildGrade(e.target.value)}
                      style={{
                        backgroundColor: '#f9fafb',
                        border: '2px solid #e2e8f0',
                        borderRadius: '9999px',
                        padding: '13px 20px',
                        color: '#4a315d',
                        fontWeight: 600,
                        fontSize: '16px',
                        outline: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = '#6A9C78';
                        e.target.style.backgroundColor = '#ffffff';
                        e.target.style.boxShadow = '0 0 0 4px rgba(106, 156, 120, 0.15)';
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0';
                        e.target.style.backgroundColor = '#f9fafb';
                        e.target.style.boxShadow = 'none';
                      }}
                    >
                      <option value="pre-k">Pre-K</option>
                      <option value="kindergarten">Kindergarten</option>
                      <option value="1">1st Grade</option>
                      <option value="2">2nd Grade</option>
                      <option value="3">3rd Grade</option>
                      <option value="4">4th Grade</option>
                      <option value="5">5th Grade</option>
                      <option value="6">6th Grade</option>
                      <option value="7">7th Grade</option>
                      <option value="8">8th Grade</option>
                    </select>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    backgroundColor: '#6A9C78',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '21px',
                    borderRadius: '9999px',
                    padding: '15px 24px',
                    boxShadow: '0 6px 0 #4c7a57',
                    border: 'none',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: '12px',
                    transition: 'transform 0.1s, background-color 0.2s'
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = 'translateY(4px)';
                    e.currentTarget.style.boxShadow = '0 2px 0 #4c7a57';
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 6px 0 #4c7a57';
                  }}
                >
                  {loading ? 'Creating Parent & Child Account...' : 'Create Account'}
                </button>
              </form>

              {/* Footer to switch back to Sign In */}
              <div className="mt-6 text-center text-[16px] font-semibold">
                <span style={{ color: '#6b7280' }}>Already have an account?</span>
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    setIsSignUp(false);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6A9C78',
                    fontWeight: 700,
                    textDecoration: 'underline',
                    textUnderlineOffset: '4px',
                    cursor: 'pointer',
                    fontSize: '16px',
                    marginLeft: '6px'
                  }}
                >
                  Sign In
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
