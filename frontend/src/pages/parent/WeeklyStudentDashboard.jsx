import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { animate, createTimeline } from 'animejs';
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

  const runChartAnimations = (snap) => {
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
      strokeDashoffset: [628.31, snap?.accuracy?.stroke_dashoffset || 94.24],
      duration: 1400,
      ease: 'inOutCubic'
    }, '-=800')
    .add('.score-center', {
      opacity: [0, 1],
      scale: [0.8, 1],
      duration: 700
    }, '-=1000')

    // 3. Bars
    .add('.bar-element', {
      height: (el) => el.getAttribute('data-height') || '40%',
      duration: 900,
      delay: (el, i) => i * 80
    }, '-=800')
    .add('.bar-value', {
      opacity: [0, 1],
      translateY: [6, 0],
      duration: 500,
      delay: (el, i) => i * 80
    }, '-=600');
  };

  // Fallback data if student has no activity yet
  const attentivity = analyticsData?.attentivity || {
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    peak_day: 'Wed',
    peak_pct: 88,
    peak_cx: 250,
    peak_cy: 30,
    svg_path: 'M30,140 C 90,160 150,60 210,90 C 250,30 320,130 390,70 C 430,90 470,60 490,60'
  };

  const accuracy = analyticsData?.accuracy || {
    percentage: 85,
    correct_count: 340,
    wrong_count: 60,
    stroke_dashoffset: 94.24
  };

  const daysBySubject = analyticsData?.days_by_subject || [
    { subject: 'Math', days: 2.5, percent: 50, color: '#116a4e' },
    { subject: 'Sci', days: 4.0, percent: 80, color: '#14b02b' },
    { subject: 'Eng', days: 2.0, percent: 40, color: '#75c96b' },
    { subject: 'Hist', days: 4.5, percent: 90, color: '#f7385f' },
    { subject: 'Art', days: 1.5, percent: 30, color: '#ff85a1' },
    { subject: 'P.E.', days: 3.5, percent: 70, color: '#4267f5' },
    { subject: 'Music', days: 1.0, percent: 20, color: '#9b51e0' }
  ];

  const highlights = analyticsData?.subject_highlights || [
    { subject: 'History', text: 'Longest duration spent reviewing', days: '4.5 Days', color: '#f7385f' },
    { subject: 'Science', text: 'Consistent daily modules', days: '4.0 Days', color: '#14b02b' },
    { subject: 'Music', text: 'Short practice sessions', days: '1.0 Days', color: '#9b51e0' }
  ];

  return (
    <div style={{
      backgroundColor: '#a8be8f',
      minHeight: '100vh',
      padding: '40px 20px',
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      color: '#3b2a49'
    }}>
      {/* Top Bar */}
      <div style={{ maxWidth: '750px', margin: '0 auto 24px auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
            {analyticsData?.analysis_text ||
              `${activeChild?.name || 'Your student'} maintained consistent focus throughout the week, peaking mid-week. They achieved a solid ${accuracy.percentage}% weekly accuracy rate.`}
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
                  Focus Peak ({attentivity.peak_day}: {attentivity.peak_pct}%)
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

        {/* Graph 3: Days Spent per Subject */}
        <div style={{
          background: 'white',
          borderRadius: '24px',
          padding: '30px',
          border: '6px solid #cca9ef',
          boxShadow: '0 10px 20px rgba(0, 0, 0, 0.08)'
        }}>
          <h2 style={{ fontSize: '20px', marginTop: 0, marginBottom: '25px', fontWeight: 700, textAlign: 'center' }}>
            Days Spent by Subject
          </h2>

          <div style={{
            position: 'relative',
            height: '320px',
            backgroundColor: '#fcfbf7',
            padding: '20px 20px 40px 45px',
            borderRadius: '12px'
          }}>
            {/* Chart Grid Lines */}
            <div style={{
              position: 'absolute',
              top: '20px',
              left: '55px',
              right: '20px',
              bottom: '40px',
              borderLeft: '2px solid #333',
              borderBottom: '2px solid #333',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}>
              {[5, 4, 3, 2, 1, 0].map((d) => (
                <div key={d} style={{ width: '100%', borderBottom: d === 0 ? 'none' : '1px solid #e0e0e0', position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '-42px', top: '-8px', fontSize: '12px', fontWeight: 600, color: '#555' }}>
                    Day {d}
                  </span>
                </div>
              ))}
            </div>

            {/* Bars Container */}
            <div style={{
              position: 'absolute',
              top: '20px',
              left: '55px',
              right: '20px',
              bottom: '42px',
              display: 'flex',
              justifyContent: 'space-around',
              alignItems: 'flex-end',
              zIndex: 10,
              height: 'calc(100% - 62px)'
            }}>
              {daysBySubject.map((s, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    width: '35px',
                    height: '100%',
                    position: 'relative'
                  }}
                >
                  <div className="bar-value" style={{ fontSize: '12px', fontWeight: 700, color: '#333', marginBottom: '6px', opacity: 0 }}>
                    {s.days}
                  </div>
                  <div
                    className="bar-element"
                    data-height={`${s.percent}%`}
                    style={{
                      width: '100%',
                      borderRadius: '6px 6px 0 0',
                      backgroundColor: s.color,
                      height: '0%'
                    }}
                  />
                  <div style={{ position: 'absolute', bottom: '-25px', fontWeight: 600, fontSize: '12px', color: '#555', textAlign: 'center', width: '100%', whiteSpace: 'nowrap' }}>
                    {s.subject}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subject Details Rows */}
          <div style={{ marginTop: '30px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {highlights.map((h, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  background: '#f0f4f8',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                <span>
                  <strong style={{ color: h.color }}>{h.subject}:</strong> {h.text}
                </span>
                <span style={{ color: '#4a315d' }}>{h.days}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
