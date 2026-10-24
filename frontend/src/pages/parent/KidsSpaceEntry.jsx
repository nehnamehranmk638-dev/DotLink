import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import { api } from '../../api';

export default function KidsSpaceEntry() {
  const navigate = useNavigate();
  const [activeChild, setActiveChild] = useState(api.getActiveChild());
  const [qrDataUrl, setQrDataUrl] = useState('');

  useEffect(() => {
    const kid = api.getActiveChild();
    if (kid) {
      setActiveChild(kid);
      // Generate actual scannable QR code directing to that parent's child study page
      const playUrl = `${window.location.origin}/play?child_id=${encodeURIComponent(kid.id)}`;
      QRCode.toDataURL(playUrl, {
        width: 160,
        margin: 1,
        color: {
          dark: '#392a48',
          light: '#ffffff'
        }
      })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error(err));
    }
  }, []);

  const handleGoToKidsSpace = () => {
    navigate('/play');
  };

  return (
    <div style={{
      fontFamily: "'Nunito', sans-serif",
      backgroundColor: '#a3b585',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem'
    }}>
      {/* Top Bar */}
      <div style={{ maxWidth: '480px', width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            backgroundColor: 'white',
            color: '#45335d',
            border: 'none',
            borderRadius: '9999px',
            padding: '8px 18px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
          }}
        >
          ← Parent Hub
        </button>

        <span style={{ backgroundColor: 'white', color: '#45335d', padding: '6px 14px', borderRadius: '9999px', fontWeight: 800, fontSize: '0.85rem' }}>
          ⭐ {activeChild?.name || 'Explorer'}
        </span>
      </div>

      {/* Main Card */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '40px',
        boxShadow: '0 12px 35px rgba(0, 0, 0, 0.08)',
        border: '8px solid #c2abeb',
        maxWidth: '480px',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'hidden'
      }}>
        <h1 style={{
          color: '#45335d',
          textAlign: 'center',
          fontSize: '2.25rem',
          fontWeight: 800,
          marginTop: '2.5rem',
          marginBottom: '0.5rem'
        }}>
          Let’s get started!
        </h1>

        <p style={{
          color: '#7b669d',
          textAlign: 'center',
          fontSize: '1.05rem',
          marginBottom: '2rem',
          fontWeight: 500,
          padding: '0 1.5rem',
          lineHeight: '1.5'
        }}>
          Scan the QR code or click below to link your child’s learning dashboard.
        </p>

        {/* QR Code Section with Soft Arch */}
        <div style={{
          backgroundColor: '#fff5f7',
          borderTopLeftRadius: '120px',
          borderTopRightRadius: '120px',
          padding: '3rem 2rem 2.5rem 2rem',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          position: 'relative',
          boxSizing: 'border-box'
        }}>
          {/* Decorative Sparkle */}
          <svg
            viewBox="0 0 24 24"
            style={{
              position: 'absolute',
              left: '32px',
              top: '40px',
              width: '32px',
              height: '32px',
              fill: '#f48fb1',
              animation: 'pulse 2s infinite ease-in-out'
            }}
          >
            <path d="M12 0C12 6.627 17.373 12 24 12C17.373 12 12 17.373 12 24C12 17.373 6.627 12 0 12C6.627 12 12 6.627 12 0Z" />
          </svg>

          {/* Framed QR Code with SCAN ME on all 4 sides */}
          <div
            onClick={handleGoToKidsSpace}
            title="Scan with phone camera or tap to launch"
            style={{
              position: 'relative',
              padding: '16px',
              border: '2px solid #f48fb1',
              borderRadius: '20px',
              display: 'inline-block',
              cursor: 'pointer',
              backgroundColor: 'white',
              boxShadow: '0 6px 16px rgba(244, 143, 177, 0.25)',
              transition: 'transform 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.03)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {/* Top SCAN ME */}
            <span style={{
              position: 'absolute',
              top: '-10px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: '#fff5f7',
              color: '#45335d',
              fontWeight: 800,
              fontSize: '0.82rem',
              letterSpacing: '0.1em',
              padding: '0 8px'
            }}>
              SCAN ME
            </span>

            {/* Bottom SCAN ME */}
            <span style={{
              position: 'absolute',
              bottom: '-10px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: '#fff5f7',
              color: '#45335d',
              fontWeight: 800,
              fontSize: '0.82rem',
              letterSpacing: '0.1em',
              padding: '0 8px'
            }}>
              SCAN ME
            </span>

            {/* Left SCAN ME */}
            <span style={{
              position: 'absolute',
              left: '-36px',
              top: '50%',
              transform: 'translateY(-50%) rotate(-90deg)',
              backgroundColor: '#fff5f7',
              color: '#45335d',
              fontWeight: 800,
              fontSize: '0.82rem',
              letterSpacing: '0.1em',
              padding: '0 8px'
            }}>
              SCAN ME
            </span>

            {/* Right SCAN ME */}
            <span style={{
              position: 'absolute',
              right: '-38px',
              top: '50%',
              transform: 'translateY(-50%) rotate(90deg)',
              backgroundColor: '#fff5f7',
              color: '#45335d',
              fontWeight: 800,
              fontSize: '0.82rem',
              letterSpacing: '0.1em',
              padding: '0 8px'
            }}>
              SCAN ME
            </span>

            {/* Generated Real Dynamic Scannable QR Code */}
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Scan to launch Kids Study Space"
                style={{ width: '150px', height: '150px', display: 'block', borderRadius: '8px' }}
              />
            ) : (
              <div style={{ width: '150px', height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', color: '#888' }}>
                Generating QR...
              </div>
            )}
          </div>

          <p style={{ marginTop: '10px', fontSize: '0.8rem', color: '#9d7ca8', fontWeight: 600 }}>
            Point your phone camera at the code above
          </p>

          {/* Divider */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            width: '80%',
            margin: '1.6rem 0'
          }}>
            <div style={{ flex: 1, height: '2px', backgroundColor: '#e2d9f3', borderRadius: '2px' }} />
            <div style={{ padding: '0 15px', color: '#8975a6', fontWeight: 800, fontSize: '0.9rem' }}>
              OR
            </div>
            <div style={{ flex: 1, height: '2px', backgroundColor: '#e2d9f3', borderRadius: '2px' }} />
          </div>

          {/* Action Button */}
          <button
            onClick={handleGoToKidsSpace}
            style={{
              backgroundColor: '#658d68',
              color: 'white',
              border: 'none',
              borderRadius: '9999px',
              padding: '1rem 2.6rem',
              fontSize: '1.25rem',
              fontWeight: 800,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 6px 18px rgba(101, 141, 104, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#567a58';
              e.currentTarget.style.transform = 'translateY(-3px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#658d68';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Go to Kids Space
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
