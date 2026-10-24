import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { animate } from 'animejs';
import { api } from '../../api';

export default function ParentHub() {
  const navigate = useNavigate();
  const [children, setChildren] = useState([]);
  const [activeChild, setActiveChild] = useState(api.getActiveChild());
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const user = api.getUser();

  useEffect(() => {
    loadChildren();

    // Entrance Animation
    animate('#dashboard-container', {
      translateY: [40, 0],
      opacity: [0, 1],
      scale: [0.95, 1],
      duration: 800,
      delay: 100,
      ease: 'outBack'
    });
  }, []);

  const loadChildren = async () => {
    try {
      const kids = await api.getChildren();
      setChildren(kids || []);
      if (kids && kids.length > 0 && !activeChild) {
        api.setActiveChild(kids[0]);
        setActiveChild(kids[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectChild = (kid) => {
    api.setActiveChild(kid);
    setActiveChild(kid);
  };

  const handleLogout = () => {
    api.logout();
    navigate('/login');
  };

  const handleSendFeedback = () => {
    setFeedbackSubmitted(true);
    setTimeout(() => {
      setFeedbackOpen(false);
      setFeedbackSubmitted(false);
      setFeedbackComment('');
    }, 1800);
  };

  return (
    <div style={{
      fontFamily: "'Baloo 2', sans-serif",
      backgroundColor: '#a9ba7d',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      color: '#4a315d'
    }}>
      {/* Top Bar with Child Switcher & Logout */}
      <div style={{
        width: '100%',
        maxWidth: '720px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Child Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 800, color: '#312340', fontSize: '0.95rem' }}>Active Child:</span>
          {children.map((k) => (
            <button
              key={k.id}
              onClick={() => handleSelectChild(k)}
              style={{
                backgroundColor: activeChild?.id === k.id ? '#45335d' : 'rgba(255, 255, 255, 0.7)',
                color: activeChild?.id === k.id ? 'white' : '#45335d',
                border: '2px solid white',
                borderRadius: '9999px',
                padding: '6px 14px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
              }}
            >
              ⭐ {k.name} (Gr {k.grade})
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => navigate('/')}
            style={{
              backgroundColor: 'white',
              color: '#45335d',
              border: 'none',
              borderRadius: '9999px',
              padding: '6px 16px',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            🏠 Home
          </button>
          <button
            onClick={handleLogout}
            style={{
              backgroundColor: '#fca5a5',
              color: '#7f1d1d',
              border: 'none',
              borderRadius: '9999px',
              padding: '6px 16px',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            Log Out
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div id="dashboard-container" style={{ width: '100%', maxWidth: '680px', opacity: 0 }}>
        {/* White Card with Thick Pastel Purple Border */}
        <div style={{
          backgroundColor: '#ffffff',
          border: '10px solid #c3a8eb',
          borderRadius: '32px',
          padding: '36px 32px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.12)'
        }}>
          {/* Heading */}
          <h1 style={{
            fontSize: '3rem',
            fontWeight: 800,
            textAlign: 'center',
            letterSpacing: '0.02em',
            marginBottom: '32px',
            color: '#4a315d',
            lineHeight: 1.1
          }}>
            Parent Hub
          </h1>

          {/* Grid for 6 Buttons */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '20px'
          }}>
            {/* Button 1: Daily Snapshot */}
            <button
              onClick={() => navigate('/analytics')}
              style={{
                width: '100%',
                backgroundColor: '#b5d5f5',
                color: '#4a315d',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '9999px',
                padding: '12px 18px',
                boxShadow: '0 4px 0 #96bde0',
                border: '2px solid white',
                cursor: 'pointer',
                transition: 'transform 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-3px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.65)',
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.8rem',
                marginRight: '14px',
                flexShrink: 0
              }}>
                📊
              </div>
              <span style={{ fontWeight: 800, fontSize: '1.15rem', textAlign: 'left', lineHeight: 1.2 }}>
                Daily Snapshot
              </span>
            </button>

            {/* Button 2: This Week's Journey */}
            <button
              onClick={() => navigate('/analytics')}
              style={{
                width: '100%',
                backgroundColor: '#ffc4cf',
                color: '#4a315d',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '9999px',
                padding: '12px 18px',
                boxShadow: '0 4px 0 #e8a7b3',
                border: '2px solid white',
                cursor: 'pointer',
                transition: 'transform 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-3px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.65)',
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.8rem',
                marginRight: '14px',
                flexShrink: 0
              }}>
                🗺️
              </div>
              <span style={{ fontWeight: 800, fontSize: '1.15rem', textAlign: 'left', lineHeight: 1.2 }}>
                This Week’s Journey
              </span>
            </button>

            {/* Button 3: Upload a Lesson */}
            <button
              onClick={() => navigate('/curriculum')}
              style={{
                width: '100%',
                backgroundColor: '#fde293',
                color: '#4a315d',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '9999px',
                padding: '12px 18px',
                boxShadow: '0 4px 0 #e3c56d',
                border: '2px solid white',
                cursor: 'pointer',
                transition: 'transform 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-3px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.65)',
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.8rem',
                marginRight: '14px',
                flexShrink: 0
              }}>
                📤
              </div>
              <span style={{ fontWeight: 800, fontSize: '1.15rem', textAlign: 'left', lineHeight: 1.2 }}>
                Upload a Lesson
              </span>
            </button>

            {/* Button 4: Pick What to Learn */}
            <button
              onClick={() => navigate('/chapters')}
              style={{
                width: '100%',
                backgroundColor: '#c3e6cb',
                color: '#4a315d',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '9999px',
                padding: '12px 18px',
                boxShadow: '0 4px 0 #a3c9ab',
                border: '2px solid white',
                cursor: 'pointer',
                transition: 'transform 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-3px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.65)',
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.8rem',
                marginRight: '14px',
                flexShrink: 0
              }}>
                🎯
              </div>
              <span style={{ fontWeight: 800, fontSize: '1.15rem', textAlign: 'left', lineHeight: 1.2 }}>
                Pick What to Learn
              </span>
            </button>

            {/* Button 5: Kids’ Study Space */}
            <button
              onClick={() => navigate('/kids-entry')}
              style={{
                width: '100%',
                backgroundColor: '#ffdac1',
                color: '#4a315d',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '9999px',
                padding: '12px 18px',
                boxShadow: '0 4px 0 #e3bd9f',
                border: '2px solid white',
                cursor: 'pointer',
                transition: 'transform 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-3px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.65)',
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.8rem',
                marginRight: '14px',
                flexShrink: 0
              }}>
                🎒
              </div>
              <span style={{ fontWeight: 800, fontSize: '1.15rem', textAlign: 'left', lineHeight: 1.2 }}>
                Kids’ Study Space
              </span>
            </button>

            {/* Button 6: Tell Us What You Think */}
            <button
              onClick={() => setFeedbackOpen(true)}
              style={{
                width: '100%',
                backgroundColor: '#e3d1fa',
                color: '#4a315d',
                display: 'flex',
                alignItems: 'center',
                borderRadius: '9999px',
                padding: '12px 18px',
                boxShadow: '0 4px 0 #c4b0df',
                border: '2px solid white',
                cursor: 'pointer',
                transition: 'transform 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-3px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.65)',
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.8rem',
                marginRight: '14px',
                flexShrink: 0
              }}>
                💭
              </div>
              <span style={{ fontWeight: 800, fontSize: '1.15rem', textAlign: 'left', lineHeight: 1.2 }}>
                Tell Us What You Think
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Feedback Modal */}
      {feedbackOpen && (
        <div className="modal-overlay" onClick={() => setFeedbackOpen(false)}>
          <div
            className="glass-panel modal-content"
            style={{ maxWidth: '480px', backgroundColor: '#ffffff', borderRadius: '28px', border: '6px solid #c3a8eb', color: '#4a315d' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '3rem' }}>💭</span>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#4a315d', marginTop: '6px' }}>
                Tell Us What You Think
              </h2>
              <p style={{ color: '#7b669d', fontSize: '0.95rem' }}>
                Your feedback helps make learning even more engaging for your child!
              </p>
            </div>

            {feedbackSubmitted ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#16a34a', fontWeight: 800, fontSize: '1.3rem' }}>
                🎉 Thank you so much for your feedback!
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <span
                      key={star}
                      onClick={() => setFeedbackRating(star)}
                      style={{
                        fontSize: '2.2rem',
                        cursor: 'pointer',
                        filter: star <= feedbackRating ? 'grayscale(0%)' : 'grayscale(100%) opacity(40%)',
                        transition: 'transform 0.15s ease'
                      }}
                    >
                      ⭐
                    </span>
                  ))}
                </div>

                <textarea
                  value={feedbackComment}
                  onChange={(e) => setFeedbackComment(e.target.value)}
                  placeholder="Share your thoughts, suggestions, or feature requests..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '16px',
                    border: '2px solid #c3a8eb',
                    outline: 'none',
                    fontSize: '0.95rem',
                    color: '#4a315d',
                    marginBottom: '20px',
                    boxSizing: 'border-box'
                  }}
                />

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    onClick={() => setFeedbackOpen(false)}
                    className="btn btn-secondary"
                    style={{ flex: 1, borderRadius: '9999px', padding: '12px' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendFeedback}
                    className="btn btn-primary"
                    style={{ flex: 1, backgroundColor: '#45335d', color: 'white', borderRadius: '9999px', padding: '12px', fontWeight: 800 }}
                  >
                    Send Feedback ⭐
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
