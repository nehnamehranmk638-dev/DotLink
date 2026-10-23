import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function Navbar() {
  const navigate = useNavigate();
  const user = api.getUser();
  const activeChild = api.getActiveChild();

  const handleLogout = () => {
    api.logout();
    navigate('/login');
  };

  return (
    <header className="app-header">
      <div className="logo-container" onClick={() => navigate(user ? '/dashboard' : '/login')}>
        <div className="logo-dot">✦</div>
        <div>
          <span className="brand-title">DotLink</span>
          <span style={{ fontSize: '0.75rem', display: 'block', color: 'var(--color-secondary)' }}>NCERT Smart Learning</span>
        </div>
      </div>

      {user ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <nav style={{ display: 'flex', gap: '16px' }}>
            <Link to="/dashboard" style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Parent Dashboard</Link>
            <Link to="/curriculum" style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Curriculum</Link>
            <Link to="/play" style={{ fontWeight: 700, color: '#38bdf8' }}>🎮 Child Play Mode</Link>
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {activeChild && (
              <span className="badge badge-science" style={{ padding: '6px 12px' }}>
                Active: {activeChild.name} ({activeChild.mascot_name})
              </span>
            )}
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{user.name}</span>
            <button className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      ) : (
        <Link to="/login" className="btn btn-primary" style={{ padding: '8px 18px' }}>
          Sign In
        </Link>
      )}
    </header>
  );
}
