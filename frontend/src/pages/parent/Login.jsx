import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

export default function Login() {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isSignUp) {
      if (!consentGiven) {
        setError('Parent consent must be provided to create an account.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await api.signup(name, email, password, consentGiven);
      } else {
        await api.login(email, password);
      }
      navigate('/curriculum');
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 72px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '36px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div className="logo-dot" style={{ margin: '0 auto 16px auto', width: '48px', height: '48px', fontSize: '1.8rem' }}>
            ✦
          </div>
          <h2>{isSignUp ? 'Parent Account Setup' : 'Parent Login'}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '6px' }}>
            {isSignUp ? 'Empower your child with AI-assisted NCERT mastery' : 'Manage your child’s learning sessions and curriculum'}
          </p>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5', padding: '12px', borderRadius: 'var(--radius-sm)', marginBottom: '20px', fontSize: '0.9rem', lineHeight: '1.4' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isSignUp && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Sarah Jenkins"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-input"
              placeholder="parent@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label className="form-label" style={{ marginBottom: 0 }}>Password</label>
              {isSignUp && (
                <span style={{ fontSize: '0.8rem', color: password.length > 0 && password.length < 6 ? '#fca5a5' : 'var(--text-muted)' }}>
                  Min 6 characters {password.length > 0 ? `(${password.length}/6)` : ''}
                </span>
              )}
            </div>
            <input
              type="password"
              className="form-input"
              placeholder={isSignUp ? "At least 6 characters" : "••••••••"}
              required
              minLength={isSignUp ? 6 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {isSignUp && (
            <div style={{ marginBottom: '24px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                id="consent"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                style={{ marginTop: '4px', cursor: 'pointer', width: '18px', height: '18px' }}
                required
              />
              <label htmlFor="consent" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <strong style={{ color: 'white' }}>Parental Consent:</strong> I verify that I am the legal parent or guardian, and I consent to my child participating in interactive NCERT learning sessions and evaluations on DotLink.
              </label>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginBottom: '16px' }}
            disabled={loading}
          >
            {loading ? 'Processing...' : isSignUp ? 'Create Parent Account' : 'Log In to Parent Dashboard'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '12px' }}>
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: 'var(--color-primary-light)', cursor: 'pointer', fontSize: '0.9rem', textDecoration: 'underline' }}
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
          >
            {isSignUp ? 'Already have an account? Log In' : "Don't have an account? Sign Up with Consent"}
          </button>
        </div>
      </div>
    </div>
  );
}
