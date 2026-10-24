import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTimeline } from 'animejs';
import { api } from '../../api';

export default function WeeklyStudentDashboard() {
  const navigate = useNavigate();
  const [activeChild, setActiveChild] = useState(api.getActiveChild());
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const kid = api.getActiveChild();
      if (!kid) {
        navigate('/login');
        return;
      }
      setActiveChild(kid);

      const res = await api.getAnalytics(kid.id);
      const snap = res.analytics?.weekly_learner_snapshot;
      setAnalyticsData(snap);

      // Trigger Anime.js Chart Animations
      setTimeout(() => {
        runChartAnimations(snap);
      }, 100);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Pure zero fallback if student has no activity yet
  const attentivity = analyticsData?.attentivity || {
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    has_activity: false,
    peak_day: 'Mon',
    peak_pct: 0,
    peak_cx: 250,
    peak_cy: 170,
    svg_path: 'M30,170 L103,170 L176,170 L250,170 L323,170 L396,170 L470,170'
  };

  const rawAccuracy = analyticsData?.accuracy;
  const accuracy = rawAccuracy && (rawAccuracy.correct_count + rawAccuracy.wrong_count > 0)
    ? rawAccuracy
    : {
        percentage: 0,
        correct_count: 0,
        wrong_count: 0,
        stroke_dashoffset: 628.31
      };

  const analysisText = analyticsData?.analysis_text ||
    `${activeChild?.name || 'Your student'} hasn't completed any learning activities yet this week. Start a lesson to track focus and accuracy stats!`;

  const runChartAnimations = (snap) => {
    const activeAcc = snap?.accuracy;
    const targetOffset = activeAcc && (activeAcc.correct_count + activeAcc.wrong_count > 0) && activeAcc.percentage > 0
      ? (activeAcc.stroke_dashoffset || 628.31)
      : 628.31;

    const tl = createTimeline({ ease: 'outExpo' });

    // 1. Line Chart Stroke & Peak
    tl.add('.attentivity-line', {
      strokeDashoffset: [700, 0],
      duration: 1400,
      ease: 'inOutSine'
    })
    .add('.peak-dot', {
      opacity: [0, 1],
      scale: [0, 1],
      duration: 500
    }, '-=400')
    .add('.tooltip-bubble', {
      opacity: [0, 1],
      scale: [0, 1],
      translateY: [8, 0],
      duration: 500,
      ease: 'outBack'
    }, '-=350')

    // 2. Accuracy Donut Circle
    .add('.segment-correct', {
      strokeDashoffset: [628.31, targetOffset],
      duration: 1400,
      ease: 'inOutCubic'
    }, '-=800')
    .add('.score-center', {
      opacity: [0, 1],
      scale: [0.8, 1],
      duration: 700
    }, '-=1000');
  };

  return (
    <div style={{
      backgroundColor: '#a8be8f',
      minHeight: '100vh',
      padding: '40px 20px',
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      color: '#3b2a49'
    }}>
      {/* Top Bar */}
      <div style={{ maxWidth: '750px', margin: '0 auto 24px auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            backgroundColor: 'white',
            color: '#3b2a49',
            border: 'none',
            borderRadius: '9999px',
            padding: '8px 20px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
          }}
        >
          ← Parent Hub
        </button>

        <span style={{ backgroundColor: 'white', color: '#3b2a49', padding: '6px 16px', borderRadius: '9999px', fontWeight: 800, fontSize: '0.9rem' }}>
          👧 {activeChild?.name || 'Student'} (Grade {activeChild?.grade || 4})
        </span>
      </div>

      <div style={{ maxWidth: '750px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '30px' }}>
        
        {/* Header Snapshot Card */}
        <div style={{
          textAlign: 'center',
          background: 'white',
          padding: '30px',
          borderRadius: '24px',
          border: '6px solid #cca9ef',
          boxShadow: '0 10px 20px rgba(0, 0, 0, 0.08)'
        }}>
          <h1 style={{ margin: '0 0 10px 0', fontSize: '28px', color: '#3b2a49', fontWeight: 800 }}>
            Weekly Learner Snapshot
          </h1>
          <p style={{ fontSize: '16px', fontWeight: 500, opacity: 0.85, margin: 0, lineHeight: 1.5 }}>
            {analysisText}
          </p>
        </div>

        {/* Graph 1: Weekly Attentivity */}
        <div style={{
          background: 'white',
          borderRadius: '24px',
          padding: '30px',
          border: '6px solid #cca9ef',
          boxShadow: '0 10px 20px rgba(0, 0, 0, 0.08)'
        }}>
          <h2 style={{ fontSize: '20px', marginTop: 0, marginBottom: '25px', fontWeight: 700, textAlign: 'center' }}>
            Weekly Attentivity
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', height: '200px' }}>
              {/* Y Axis */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                paddingRight: '10px',
                fontSize: '12px',
                fontWeight: 600,
                color: '#666',
                borderRight: '2px solid #ddd'
              }}>
                <span>100%</span>
                <span>75%</span>
                <span>50%</span>
                <span>25%</span>
                <span>0%</span>
              </div>

              {/* Attentivity Board */}
              <div style={{
                background: '#ffa48a',
                borderRadius: '0 16px 16px 0',
                flexGrow: 1,
                position: 'relative',
                overflow: 'hidden'
              }}>
                <svg viewBox="0 0 500 200" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
                  <path
                    className="attentivity-line"
                    d={attentivity.svg_path}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray="700"
                    strokeDashoffset="700"
                  />
                  <circle
                    className="peak-dot"
                    cx={attentivity.peak_cx}
                    cy={attentivity.peak_cy}
                    r="8"
                    fill="#ffffff"
                    style={{ opacity: 0 }}
                  />
                </svg>

                {/* Tooltip Bubble */}
                <div
                  className="tooltip-bubble"
                  style={{
                    position: 'absolute',
                    top: `${Math.max(10, attentivity.peak_cy - 12)}px`,
                    left: `${(attentivity.peak_cx / 500) * 100}%`,
                    transform: 'translateX(-50%)',
                    background: '#4a4a4a',
                    color: 'white',
                    padding: '6px 14px',
                    borderRadius: '12px',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                    opacity: 0
                  }}
                >
                  {attentivity.has_activity
                    ? `Focus Peak (${attentivity.peak_day}: ${attentivity.peak_pct}%)`
                    : 'No Activity Yet (0%)'}
                </div>
              </div>
            </div>

            {/* X Axis */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingLeft: '45px',
              marginTop: '10px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#666'
            }}>
              {attentivity.days.map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Graph 2: Weekly Accuracy */}
        <div style={{
          background: 'white',
          borderRadius: '24px',
          padding: '30px',
          border: '6px solid #cca9ef',
          boxShadow: '0 10px 20px rgba(0, 0, 0, 0.08)'
        }}>
          <h2 style={{ fontSize: '20px', marginTop: 0, marginBottom: '25px', fontWeight: 700, textAlign: 'center' }}>
            Weekly Accuracy Total
          </h2>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', minHeight: '260px' }}>
            <svg viewBox="0 0 240 240" style={{ width: 'min(100%, 250px)', height: 'auto', filter: 'drop-shadow(0 8px 12px rgba(59, 42, 73, 0.12))' }}>
              <circle
                cx="120"
                cy="120"
                r="100"
                fill="none"
                stroke="#ff9fb8"
                strokeWidth="24"
              />
              <circle
                className="segment-correct"
                cx="120"
                cy="120"
                r="100"
                fill="none"
                stroke="#6a9a73"
                strokeWidth="24"
                strokeLinecap="round"
                strokeDasharray="628.31"
                strokeDashoffset="628.31"
                transform="rotate(-90 120 120)"
              />
            </svg>

            <div className="score-center" style={{ position: 'absolute', textAlign: 'center', display: 'flex', flexDirection: 'column', opacity: 0 }}>
              <div style={{ fontSize: '56px', fontWeight: 800, lineHeight: 1, letterSpacing: '-2px' }}>
                {accuracy.percentage}%
              </div>
              <div style={{ fontSize: '14px', opacity: 0.7, fontWeight: 600, marginTop: '4px' }}>
                Weekly Average
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '16px', fontSize: '14px', fontWeight: 600 }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ display: 'inline-block', width: '14px', height: '14px', borderRadius: '50%', backgroundColor: '#6a9a73', marginRight: '6px' }} />
              Correct ({accuracy.correct_count} Qs)
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ display: 'inline-block', width: '14px', height: '14px', borderRadius: '50%', backgroundColor: '#ff9fb8', marginRight: '6px' }} />
              Wrong ({accuracy.wrong_count} Qs)
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
