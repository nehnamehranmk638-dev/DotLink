import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

export default function Dashboard() {
  const navigate = useNavigate();
  const user = api.getUser();
  const activeChild = api.getActiveChild();

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2.2rem', marginBottom: '8px' }}>Parent Dashboard</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            Real-time session monitoring, weekly focus analytics, and deterministic feedback.
          </p>
        </div>

        <button className="btn btn-primary" onClick={() => navigate('/curriculum')}>
          + Manage Curriculum
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📊</div>
        <h2 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>Phase 1 Setup Active</h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: '600px', margin: '0 auto 24px auto' }}>
          Welcome, {user?.name || 'Parent'}! Complete your curriculum setup in the Curriculum tab to fetch NCERT chapters, generate lessons with AI agents, and approve content for your child.
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/curriculum')}>
          Go to Curriculum Setup →
        </button>
      </div>
    </div>
  );
}
