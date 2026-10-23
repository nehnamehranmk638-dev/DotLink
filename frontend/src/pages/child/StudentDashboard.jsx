import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function StudentDashboard() {
  const navigate = useNavigate();
  return (
    <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '24px', textAlign: 'center' }}>
      <div className="glass-panel" style={{ padding: '40px' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '12px' }}>🎮 Student Play Mode</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
          Interactive student dashboard with subject tags, stars counter, and animated lessons will be fully unlocked in Phase 2.
        </p>
        <button className="btn btn-secondary" onClick={() => navigate('/curriculum')}>
          ← Back to Curriculum Setup
        </button>
      </div>
    </div>
  );
}
