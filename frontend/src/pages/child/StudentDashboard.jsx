import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [activeChild, setActiveChild] = useState(api.getActiveChild());
  const [children, setChildren] = useState([]);
  const [topics, setTopics] = useState([]);
  const [pendingLessons, setPendingLessons] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [startingTopicId, setStartingTopicId] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    loadStudentData();
  }, []);

  // A child's page may remain open while a parent generates or approves a lesson.
  useEffect(() => {
    if (!activeChild?.id) return;
    let current = true;
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const res = await api.getPlayTopics(activeChild.id);
        if (current) {
          setTopics(res.topics || []);
          setPendingLessons(res.pending_lessons || []);
          setLoadError('');
        }
      } catch { /* Keep the last successful lesson list during a background refresh. */ }
    };
    const interval = setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    return () => { current = false; clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [activeChild?.id]);

  const loadStudentData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      let kids = await api.getChildren();
      if (!kids || kids.length === 0) {
        try {
          const newKid = await api.createChild({
            name: 'Learner',
            age: 9,
            grade: 4,
            mascot_name: 'Luna the Owl'
          });
          kids = [newKid];
        } catch (e) {
          console.error('Could not auto-create child:', e);
        }
      }
      setChildren(kids || []);
      let currentKid = activeChild;
      if (!currentKid && kids && kids.length > 0) {
        currentKid = kids[0];
        api.setActiveChild(kids[0]);
        setActiveChild(kids[0]);
      } else if (currentKid && kids && kids.length > 0) {
        const found = kids.find((k) => k.id === currentKid.id);
        if (!found) {
          currentKid = kids[0];
          api.setActiveChild(kids[0]);
          setActiveChild(kids[0]);
        }
      }

      if (currentKid) {
        const res = await api.getPlayTopics(currentKid.id);
        setTopics(res.topics || []);
        setPendingLessons(res.pending_lessons || []);
      }
    } catch (err) {
      setLoadError(err.message || 'Could not load lessons. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchChild = async (kid) => {
    api.setActiveChild(kid);
    setActiveChild(kid);
    setLoading(true);
    setSelectedSubject('ALL');
    setLoadError('');
    setTopics([]);
    setPendingLessons([]);
    try {
      const res = await api.getPlayTopics(kid.id);
      setTopics(res.topics || []);
      setPendingLessons(res.pending_lessons || []);
    } catch (err) {
      setLoadError(err.message || 'Could not load lessons. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartOrResume = async (topic) => {
    if (!topic.is_unlocked) return;
    setStartingTopicId(topic.id);
    try {
      const kidId = activeChild?.id || (children[0] ? children[0].id : null);
      if (!kidId) {
        alert('Please select or create a child profile first.');
        return;
      }
      const sess = await api.startOrResumeSession(kidId, topic.id);
      navigate(`/play/session/${sess.session_id}`);
    } catch (err) {
      alert(err.message || 'Could not start session');
    } finally {
      setStartingTopicId(null);
    }
  };

  const visibleLessons = [...topics, ...pendingLessons];
  const uniqueSubjects = Array.from(new Set(visibleLessons.map((t) => t.subject_tag).filter(Boolean)));
  const subjects = ['ALL', ...uniqueSubjects];
  const filteredTopics = selectedSubject === 'ALL'
    ? visibleLessons
    : visibleLessons.filter((t) => (t.subject_tag || '').toLowerCase() === selectedSubject.toLowerCase());

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
      {/* Child Header Card */}
      <div
        className="glass-panel"
        style={{
          padding: '28px 36px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '36px',
          flexWrap: 'wrap',
          gap: '20px',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.9) 0%, rgba(99, 102, 241, 0.25) 100%)',
          border: '1px solid rgba(165, 180, 252, 0.3)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '24px',
              background: 'linear-gradient(135deg, #f59e0b, #ec4899)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '2.5rem',
              boxShadow: '0 8px 24px rgba(236, 72, 153, 0.4)'
            }}
          >
            {activeChild?.mascot_name?.includes('Lion') ? '🦁' :
             activeChild?.mascot_name?.includes('Owl') ? '🦉' :
             activeChild?.mascot_name?.includes('Fox') ? '🦊' : '🐧'}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '2.2rem' }}>Hi, {activeChild?.name || 'Explorer'}!</h1>
              <span className="badge badge-science" style={{ fontSize: '0.85rem' }}>
                Grade {activeChild?.grade || 4}
              </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '4px' }}>
              Companion: <strong>{activeChild?.mascot_name || 'Mascot'}</strong> · Ready for today’s NCERT adventure!
            </p>
          </div>
        </div>

        {/* Stars Counter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            className="glass-panel-elevated"
            style={{
              padding: '12px 24px',
              borderRadius: 'var(--radius-full)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '2px solid rgba(245, 158, 11, 0.4)'
            }}
          >
            <span style={{ fontSize: '2rem', animation: 'bounce 1s infinite alternate' }}>⭐</span>
            <div>
              <span style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fbbf24', display: 'block', lineHeight: '1' }}>
                {activeChild?.total_stars || 0}
              </span>
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Total Stars
              </span>
            </div>
          </div>

          {children.length > 1 && (
            <select
              className="form-select"
              style={{ width: 'auto', padding: '10px 14px' }}
              value={activeChild?.id || ''}
              onChange={(e) => {
                const k = children.find((c) => c.id === e.target.value);
                if (k) handleSwitchChild(k);
              }}
            >
              {children.map((c) => (
                <option key={c.id} value={c.id}>Switch: {c.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Subject Filter Tags */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '28px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: '600' }}>Filter Subjects:</span>
        {subjects.map((sub) => (
          <button
            key={sub}
            className={`btn ${selectedSubject === sub ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 18px', fontSize: '0.9rem' }}
            onClick={() => setSelectedSubject(sub)}
          >
            {sub === 'ALL' ? '🌟 All Subjects' : sub}
          </button>
        ))}
      </div>

      {/* Topics Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '1.2rem' }}>Loading approved NCERT topics...</p>
        </div>
      ) : loadError ? (
        <div role="alert" className="glass-panel" style={{ padding: '32px' }}>
          <p>{loadError}</p>
          <button className="btn btn-primary" onClick={loadStudentData}>Try loading lessons again</button>
        </div>
      ) : filteredTopics.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📖</div>
          <h2 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>No Approved Lessons Available Yet</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '500px', margin: '0 auto 24px auto' }}>
            Ask your parent to check the lessons in Curriculum. Lessons awaiting review appear here after parent approval.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/curriculum')}>
            Switch to Parent Setup →
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '24px' }}>
          {filteredTopics.map((topic, idx) => {
            const needsReview = topic.is_pending_review;
            const isLocked = !needsReview && !topic.is_unlocked;
            const isMastered = topic.is_mastered;
            const isResuming = topic.has_active_session && topic.last_scene_index > 0;
            const cleanSub = (topic.subject_tag || 'maths').toLowerCase().replace(/\s+/g, '_');

            return (
              <div
                key={topic.id}
                className="glass-panel"
                style={{
                  padding: '28px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  opacity: isLocked ? 0.6 : 1,
                  position: 'relative',
                  border: isMastered ? '2px solid #10b981' : isLocked ? '1px dashed var(--border-subtle)' : '1px solid var(--border-subtle)',
                  background: isMastered
                    ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(30, 41, 59, 0.8) 100%)'
                    : 'var(--bg-surface)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span className={`badge badge-${cleanSub}`}>
                      {topic.subject_tag}
                    </span>
                    {needsReview ? (
                      <span className="badge badge-science">Generated · Parent review needed</span>
                    ) : isMastered ? (
                      <span className="badge badge-status-approved">
                        🏆 Mastered
                      </span>
                    ) : isLocked ? (
                      <span className="badge badge-secondary" style={{ background: 'rgba(100, 116, 139, 0.4)' }}>
                        🔒 Locked
                      </span>
                    ) : (
                      <span className="badge badge-science">
                        ✨ Unlocked
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '0.82rem', color: 'var(--color-primary-light)', fontWeight: '700', marginBottom: '6px', letterSpacing: '0.03em' }}>
                    {topic.chapter_title ? `Chapter ${topic.chapter_number || 1}: ${topic.chapter_title}` : (topic.chapter_name || topic.textbook_title)}
                  </div>

                  <h3 style={{ fontSize: '1.25rem', marginBottom: '8px', lineHeight: '1.3' }}>
                    {topic.chapter_number && topic.topic_number ? `Topic ${topic.chapter_number}.${topic.topic_number}: ` : ''}{topic.name}
                  </h3>

                  {topic.description && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginBottom: '12px', lineHeight: '1.4' }}>
                      {topic.description}
                    </p>
                  )}

                  <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginBottom: '18px' }}>
                    {topic.textbook_title} · Pages {topic.start_page} to {topic.end_page}
                  </p>
                </div>

                <div>
                  {needsReview ? (
                    <div style={{ padding: '12px', borderRadius: 'var(--radius-sm)', background: 'rgba(165, 180, 252, 0.12)' }}>
                      <p style={{ marginBottom: '12px' }}>Your lesson is generated. Ask your parent to review it in Curriculum before you start.</p>
                      <button className="btn btn-secondary" style={{ width: '100%' }} disabled>Waiting for parent approval</button>
                    </div>
                  ) : isLocked ? (
                    <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '12px', borderRadius: 'var(--radius-sm)', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                      🔒 Pass the 7/10 quiz in previous topic to unlock this lesson
                    </div>
                  ) : (
                    <button
                      className={`btn ${isResuming ? 'btn-primary' : 'btn-success'} btn-lg`}
                      style={{ width: '100%' }}
                      disabled={startingTopicId === topic.id}
                      onClick={() => handleStartOrResume(topic)}
                    >
                      {startingTopicId === topic.id
                        ? 'Opening Lesson...'
                        : isResuming
                        ? `🔄 Resume Lesson (Scene ${topic.last_scene_index + 1})`
                        : '▶ Start Animated Lesson'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
