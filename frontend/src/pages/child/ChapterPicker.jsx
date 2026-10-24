import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { animate } from 'animejs';
import { api } from '../../api';

export default function ChapterPicker() {
  const navigate = useNavigate();
  const [activeChild, setActiveChild] = useState(api.getActiveChild());
  const [chapters, setChapters] = useState([]);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChapters();
  }, []);

  const loadChapters = async () => {
    try {
      setLoading(true);
      const kid = api.getActiveChild();
      if (!kid) {
        navigate('/login');
        return;
      }
      setActiveChild(kid);

      const res = await api.getPlayTopics(kid.id);
      const topics = res.topics || [];

      const parsedChapters = (res.chapters || []).map((chapter) => {
        const chapterTopics = topics.filter(t => t.textbook_id === chapter.textbook_id && (t.chapter_number || 1) === chapter.chapter_number);
        return {
          id: `${chapter.textbook_id}:${chapter.chapter_number}`,
          number: chapter.chapter_number,
          title: chapter.chapter_title || `Chapter ${chapter.chapter_number}`,
          subject: chapter.subject_tag,
          topics: chapterTopics,
          progress: chapterTopics.length ? Math.round(chapterTopics.reduce((sum, t) => sum + (t.study_progress || 0), 0) / chapterTopics.length) : 0,
          focusMinutes: Math.round(chapterTopics.reduce((sum, t) => sum + (t.focus_seconds || 0), 0) / 60),
          firstTopic: chapterTopics.find(t => t.is_unlocked && !t.is_mastered) || chapterTopics[0]
        };
      });
      setChapters(parsedChapters);
      const initial = parsedChapters[0] || null;
      setSelectedChapter(initial);

      // Trigger pop-in animation
      setTimeout(() => {
        animate('.chapter-wrapper', {
          scale: [0.5, 1],
          opacity: [0, 1],
          delay: (el, i) => i * 60,
          duration: 700,
          ease: 'outBack'
        });

        if (initial) {
          animateTimeline(initial.progress, initial.id);
        }
      }, 50);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const animateTimeline = (targetProgress) => {
    const timelineFill = document.getElementById('timeline-fill');
    const timelinePercent = document.getElementById('timeline-percent');
    if (!timelineFill || !timelinePercent) return;

    timelinePercent.innerText = `${targetProgress}%`;
    animate(timelineFill, { width: `${targetProgress}%`, duration: 250, ease: 'outQuad' });
  };

  const handleSelectChapter = (ch) => {
    setSelectedChapter(ch);
    animateTimeline(ch.progress, ch.id);
  };

  const handleStartChapter = async () => {
    const topic = selectedChapter?.firstTopic;
    if (!topic?.is_unlocked) return;
    try {
      const session = await api.startOrResumeSession(activeChild.id, topic.id);
      navigate(`/play/session/${session.session_id}`);
    } catch (error) { console.error(error); }
  };

  return (
    <div style={{
      fontFamily: "'Inter', sans-serif",
      backgroundColor: '#a3b585',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem'
    }}>
      {/* Top Header Bar */}
      <div style={{
        width: '100%',
        maxWidth: '920px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            backgroundColor: 'white',
            color: '#45335d',
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ backgroundColor: 'white', color: '#45335d', padding: '6px 16px', borderRadius: '9999px', fontWeight: 800, fontSize: '0.9rem' }}>
            👧 {activeChild?.name || 'Explorer'} (Grade {activeChild?.grade || 4})
          </span>
          <button
            onClick={() => navigate('/play')}
            style={{
              backgroundColor: '#45335d',
              color: 'white',
              border: 'none',
              borderRadius: '9999px',
              padding: '8px 20px',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Study Space →
          </button>
        </div>
      </div>

      {/* Main Card */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '32px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.05)',
        border: '8px solid #c2abeb',
        maxWidth: '900px',
        width: '100%',
        padding: '3rem 2rem',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <h1 style={{
          color: '#45335d',
          textAlign: 'center',
          fontSize: '2.5rem',
          fontWeight: 700,
          marginBottom: '2.5rem',
          letterSpacing: '-0.025em'
        }}>
          Choose a Chapter
        </h1>

        {/* One notebook per PDF chapter */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(85px, 1fr))',
          gap: '24px 20px',
          justifyItems: 'center',
          width: '100%',
          maxWidth: '820px'
        }}>
          {loading && <p>Loading your chapters…</p>}
          {!loading && chapters.length === 0 && <p>Upload a textbook to choose a chapter.</p>}
          {chapters.map((ch) => {
            const isSelected = selectedChapter?.id === ch.id;
            return (
              <div
                key={ch.id}
                className="chapter-wrapper"
                role="button" tabIndex={0}
                aria-label={`Choose ${ch.title}`}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectChapter(ch); } }}
                onClick={() => handleSelectChapter(ch)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  cursor: 'pointer',
                  opacity: 0,
                  transform: 'scale(0.5)'
                }}
              >
                {/* CSS Notebook Drawing */}
                <div
                  style={{
                    position: 'relative',
                    width: '75px',
                    height: '95px',
                    marginBottom: '0.5rem',
                    transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    transform: isSelected ? 'translateY(-6px) scale(1.1) rotate(-1deg)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.transform = 'translateY(-8px) scale(1.05) rotate(-2deg)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.transform = 'none';
                  }}
                >
                  {/* Yellow Bookmark Ribbon at bottom */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '-14px',
                      left: '14px',
                      width: '14px',
                      height: '24px',
                      backgroundColor: '#FFC000',
                      zIndex: 0,
                      clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 75%, 0 100%)',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                  />

                  {/* White Pages peaking out */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      left: '4px',
                      width: '75px',
                      height: '98px',
                      backgroundColor: '#fcf8f2',
                      borderRadius: '4px 10px 10px 4px',
                      border: '1.5px solid #e0d4c3',
                      zIndex: 1,
                      backgroundImage: 'repeating-linear-gradient(to bottom, transparent, transparent 4px, rgba(0,0,0,0.04) 4px, rgba(0,0,0,0.04) 5px)'
                    }}
                  />

                  {/* Red Cover with Heart */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '71px',
                      height: '95px',
                      backgroundColor: '#CD4B4B',
                      borderRadius: '4px 8px 8px 4px',
                      zIndex: 2,
                      boxShadow: isSelected
                        ? 'inset 4px 0 8px rgba(0,0,0,0.15), 0 10px 18px -3px rgba(205, 75, 75, 0.5)'
                        : 'inset 4px 0 8px rgba(0,0,0,0.15), 2px 2px 5px rgba(0,0,0,0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: isSelected ? '2px solid #FFD100' : 'none'
                    }}
                  >
                    {/* Spine crease */}
                    <div style={{ position: 'absolute', left: '5px', top: 0, bottom: 0, width: '2px', background: 'rgba(0,0,0,0.08)' }} />

                    {/* SVG Orange Heart */}
                    <svg viewBox="0 0 24 24" style={{ width: '22px', height: '22px', fill: '#F28C28', transform: 'rotate(-5deg)' }}>
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                  </div>
                </div>

                <span style={{ fontFamily: "'Kalam', cursive", color: '#45335d', fontWeight: 700, fontSize: '1rem', marginTop: '4px', maxWidth: '140px', textAlign: 'center', overflowWrap: 'anywhere' }}>
                  {ch.title}
                </span>
              </div>
            );
          })}
        </div>

        {/* Interactive Progress Timeline */}
        {selectedChapter && (
          <div style={{
            width: '100%',
            maxWidth: '620px',
            marginTop: '2.5rem',
            paddingTop: '1.8rem',
            borderTop: '2px dashed #c2abeb',
            textAlign: 'center'
          }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#45335d', marginBottom: '8px' }}>
              Chapter <span style={{ color: '#658d68' }}>{selectedChapter.number}</span> Progress ·{' '}
              <span style={{ fontSize: '1.05rem', color: '#7b669d' }}>{selectedChapter.title}</span>
            </h2>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#8975a6' }}>0%</span>
              <div style={{
                width: '100%',
                backgroundColor: '#f0e6fa',
                borderRadius: '9999px',
                height: '14px',
                overflow: 'hidden',
                margin: '1rem 0',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)',
                position: 'relative'
              }}>
                <div
                  id="timeline-fill"
                  style={{
                    height: '100%',
                    width: `${selectedChapter.progress}%`,
                    background: '#658d68',
                    borderRadius: '9999px',
                    position: 'relative'
                  }}
                />
              </div>
              <span id="timeline-percent" style={{ fontSize: '0.85rem', fontWeight: 700, color: '#45335d', width: '48px', textAlign: 'right' }}>
                {selectedChapter.progress}%
              </span>
            </div>

            <p style={{ color: '#8975a6', fontSize: '0.9rem', marginTop: '6px', fontWeight: 500 }}>
              {selectedChapter.focusMinutes} minutes studied · {selectedChapter.topics.length ? '' : 'Awaiting parent review · '}
              {selectedChapter.progress === 100
                ? 'Completed! Great job. 🏆'
                : selectedChapter.progress > 0
                ? "Keep going, you're doing great! ⭐"
                : 'Not started yet. Ready to dive in? 🚀'}
            </p>

            <button
              disabled={!selectedChapter.firstTopic?.is_unlocked}
              onClick={handleStartChapter}
              style={{
                marginTop: '16px',
                backgroundColor: '#658d68',
                color: 'white',
                border: 'none',
                borderRadius: '9999px',
                padding: '12px 32px',
                fontSize: '1.05rem',
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 6px 15px rgba(101, 141, 104, 0.35)',
                transition: 'transform 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              Start / Continue Chapter {selectedChapter.id} →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
