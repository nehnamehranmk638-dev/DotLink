import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { api } from '../../api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export default function Dashboard() {
  const navigate = useNavigate();
  const user = api.getUser();
  const [children, setChildren] = useState([]);
  const [activeChild, setActiveChild] = useState(api.getActiveChild());

  // Analytics & Feedback
  const [analyticsData, setAnalyticsData] = useState(null);
  const [feedbackData, setFeedbackData] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState('accuracy'); // 'accuracy' | 'attention' | 'time_focused' | 'speed'
  const [loading, setLoading] = useState(true);

  // Live SSE Status
  const [liveEvent, setLiveEvent] = useState(null);
  const [activeAlert, setActiveAlert] = useState(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadDashboard();
  }, [user]);

  useEffect(() => {
    if (activeChild) {
      initLiveSSE(activeChild.id);
      loadAnalytics(activeChild.id);
    }
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [activeChild]);

  const loadDashboard = async () => {
    try {
      const kids = await api.getChildren();
      setChildren(kids);
      let curr = activeChild;
      if (!curr && kids.length > 0) {
        curr = kids[0];
        api.setActiveChild(kids[0]);
        setActiveChild(kids[0]);
      }
      if (curr) {
        await loadAnalytics(curr.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadAnalytics = async (childId) => {
    setLoading(true);
    try {
      const res = await api.getAnalytics(childId);
      setAnalyticsData(res.analytics);
      setFeedbackData(res.feedback);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Real-time SSE Stream Connection
  const initLiveSSE = (childId) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const sseUrl = api.getLiveStreamUrl(childId);
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    es.addEventListener('connected', (e) => {
      setLiveEvent({ type: 'connected', message: 'Live monitoring active' });
    });

    es.addEventListener('session_started', (e) => {
      const data = JSON.parse(e.data);
      setLiveEvent({ type: 'active', message: `Learning in progress: ${data.topic_name || 'Topic'}` });
    });

    es.addEventListener('session_paused', (e) => {
      const data = JSON.parse(e.data);
      setLiveEvent({ type: 'paused', message: `Session paused at Scene ${data.last_scene_index || 1}` });
    });

    es.addEventListener('idle_alert', (e) => {
      const data = JSON.parse(e.data);
      setActiveAlert({
        type: 'idle_alert',
        title: 'Child Inactivity Alert',
        message: data.message || "Child did not respond to 'Are you still watching?'. Session automatically paused.",
        time: new Date().toLocaleTimeString()
      });
      setLiveEvent({ type: 'idle', message: 'Auto-paused due to inactivity' });
    });

    es.addEventListener('session_completed', (e) => {
      const data = JSON.parse(e.data);
      setLiveEvent({ type: 'completed', message: `Topic mastered! Score: ${data.score}/10` });
      loadAnalytics(childId);
    });

    es.onerror = () => {
      // Reconnection handled automatically by browser EventSource
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#f8fafc', font: { family: 'Plus Jakarta Sans', size: 12 } }
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        titleColor: '#fff',
        bodyColor: '#cbd5e1',
        borderColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1
      }
    },
    scales: {
      x: {
        ticks: { color: '#94a3b8' },
        grid: { color: 'rgba(255, 255, 255, 0.06)' }
      },
      y: {
        ticks: { color: '#94a3b8' },
        grid: { color: 'rgba(255, 255, 255, 0.06)' }
      }
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
      {/* Live Status Banner (SSE Real-Time Monitoring) */}
      <div
        className="glass-panel"
        style={{
          padding: '20px 28px',
          marginBottom: '28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          borderLeft: activeAlert ? '6px solid #ef4444' : '6px solid #10b981',
          background: activeAlert
            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.18) 0%, rgba(30, 41, 59, 0.8) 100%)'
            : 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(30, 41, 59, 0.8) 100%)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: activeAlert ? '#ef4444' : '#10b981',
              boxShadow: activeAlert ? '0 0 12px #ef4444' : '0 0 12px #10b981',
              animation: 'pulse-glow 1.5s infinite'
            }}
          />
          <div>
            <h4 style={{ fontSize: '1.05rem', marginBottom: '2px' }}>
              {activeAlert ? '⚠ Child Inactivity Alert Received via SSE' : 'Live Status: Active Learning Monitor'}
            </h4>
            <p style={{ fontSize: '0.875rem', color: activeAlert ? '#fca5a5' : 'var(--text-muted)' }}>
              {activeAlert
                ? activeAlert.message
                : liveEvent
                ? liveEvent.message
                : `Monitoring ${activeChild?.name || 'child'} in real time`}
            </p>
          </div>
        </div>

        {activeAlert && (
          <button
            className="btn btn-secondary"
            style={{ padding: '6px 14px', fontSize: '0.85rem' }}
            onClick={() => setActiveAlert(null)}
          >
            Dismiss Alert ✕
          </button>
        )}
      </div>

      {/* Top Header & Child Switcher */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', marginBottom: '6px' }}>Parent Learning Analytics</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Weekly focus trends, deterministic evaluation cards, and live child attention insights.
          </p>
        </div>

        {children.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Child:</span>
            <select
              className="form-select"
              value={activeChild?.id || ''}
              onChange={(e) => {
                const k = children.find((c) => c.id === e.target.value);
                if (k) {
                  api.setActiveChild(k);
                  setActiveChild(k);
                }
              }}
            >
              {children.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.mascot_name}) · Grade {c.grade}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Deterministic Feedback Card (insights_rules.py - NO LLM) */}
      {feedbackData && (
        <div
          className="glass-panel-elevated"
          style={{
            padding: '28px 32px',
            marginBottom: '32px',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(30, 41, 59, 0.9) 100%)',
            border: '1px solid rgba(165, 180, 252, 0.3)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
            <div>
              <span className="badge badge-primary" style={{ marginBottom: '8px' }}>Weekly Rule-Based Feedback Card</span>
              <h3 style={{ fontSize: '1.4rem', marginTop: '4px' }}>{feedbackData.headline}</h3>
            </div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>Deterministic Python Rules Engine</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '20px' }}>
            {/* Completed Topics */}
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <strong style={{ fontSize: '0.85rem', color: '#10b981', display: 'block', marginBottom: '8px' }}>
                ✓ TOPICS MASTERED THIS WEEK ({feedbackData.completed_count})
              </strong>
              {feedbackData.completed_topics.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>No topics completed yet this week.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {feedbackData.completed_topics.map((t, i) => (
                    <li key={i} style={{ fontSize: '0.9rem', marginBottom: '6px' }}>
                      • <strong>{t.name}</strong> <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>({t.subject})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Revision Needs */}
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <strong style={{ fontSize: '0.85rem', color: '#f59e0b', display: 'block', marginBottom: '8px' }}>
                ⚠ TOPICS NEEDING REVISION ({feedbackData.needing_revision.length})
              </strong>
              {feedbackData.needing_revision.length === 0 ? (
                <p style={{ fontSize: '0.85rem', color: '#6ee7b7' }}>All topics showing solid concept mastery!</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {feedbackData.needing_revision.map((t, i) => (
                    <li key={i} style={{ fontSize: '0.9rem', marginBottom: '6px' }}>
                      • <strong>{t.name}</strong>: {t.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Next Recommendation */}
            <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '16px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
              <strong style={{ fontSize: '0.85rem', color: '#38bdf8', display: 'block', marginBottom: '8px' }}>
                🎯 RECOMMENDED NEXT TOPIC
              </strong>
              {feedbackData.recommended_next ? (
                <div>
                  <h4 style={{ fontSize: '0.95rem' }}>{feedbackData.recommended_next.name}</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {feedbackData.recommended_next.chapter} · {feedbackData.recommended_next.page_range}
                  </p>
                </div>
              ) : (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>All current topics mastered!</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4 Core Learning Metrics - Stat Cards */}
      {analyticsData && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          <div
            className={`glass-panel ${selectedMetric === 'accuracy' ? 'glass-panel-elevated' : ''}`}
            style={{ padding: '20px', cursor: 'pointer', border: selectedMetric === 'accuracy' ? '2px solid #6366f1' : '1px solid var(--border-subtle)' }}
            onClick={() => setSelectedMetric('accuracy')}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>1. Accuracy</span>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#a5b4fc', margin: '8px 0' }}>
              {analyticsData.summary.weekly_avg_accuracy}%
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>First-attempt silent accuracy</span>
          </div>

          <div
            className={`glass-panel ${selectedMetric === 'attention' ? 'glass-panel-elevated' : ''}`}
            style={{ padding: '20px', cursor: 'pointer', border: selectedMetric === 'attention' ? '2px solid #ec4899' : '1px solid var(--border-subtle)' }}
            onClick={() => setSelectedMetric('attention')}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>2. Attention Span</span>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f472b6', margin: '8px 0' }}>
              {analyticsData.summary.weekly_avg_attention_mins}m
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Avg continuous active minutes</span>
          </div>

          <div
            className={`glass-panel ${selectedMetric === 'speed' ? 'glass-panel-elevated' : ''}`}
            style={{ padding: '20px', cursor: 'pointer', border: selectedMetric === 'speed' ? '2px solid #f59e0b' : '1px solid var(--border-subtle)' }}
            onClick={() => setSelectedMetric('speed')}
          >
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>4. Speed of Response</span>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fbbf24', margin: '8px 0' }}>
              {analyticsData.summary.weekly_avg_speed_secs}s
            </div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Avg response time post-lock</span>
          </div>
        </div>
      )}

      {/* Main Chart Card (Chart.js via react-chartjs-2) */}
      {analyticsData && (
        <div className="glass-panel" style={{ padding: '32px', marginBottom: '36px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ fontSize: '1.3rem' }}>
              Weekly Analysis: {
                selectedMetric === 'accuracy' ? 'First-Attempt vs Final Accuracy Trend' :
                selectedMetric === 'attention' ? 'Attention Span Before Pause / Mini-Game' :
                'Average Response Speed Post-Lock'
              }
            </h3>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className={`btn ${selectedMetric === 'accuracy' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                onClick={() => setSelectedMetric('accuracy')}
              >
                Accuracy
              </button>
              <button
                className={`btn ${selectedMetric === 'attention' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                onClick={() => setSelectedMetric('attention')}
              >
                Attention Span
              </button>
              <button
                className={`btn ${selectedMetric === 'speed' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                onClick={() => setSelectedMetric('speed')}
              >
                Speed
              </button>
            </div>
          </div>

          <div style={{ height: '360px', width: '100%' }}>
            {selectedMetric === 'attention' ? (
              <Line data={analyticsData.charts.attention} options={chartOptions} />
            ) : selectedMetric === 'speed' ? (
              <Line data={analyticsData.charts.speed} options={chartOptions} />
            ) : (
              <Line data={analyticsData.charts.accuracy} options={chartOptions} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
