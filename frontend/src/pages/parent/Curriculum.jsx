import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

const STARTER_MASCOTS = [
  { name: 'Leo the Lion', icon: '🦁', desc: 'Brave & Curious' },
  { name: 'Luna the Owl', icon: '🦉', desc: 'Wise & Focused' },
  { name: 'Sparky the Fox', icon: '🦊', desc: 'Clever & Quick' },
  { name: 'Astro the Penguin', icon: '🐧', desc: 'Patient & Explorer' }
];

export default function Curriculum() {
  const navigate = useNavigate();
  const [children, setChildren] = useState([]);
  const [activeChild, setActiveChild] = useState(api.getActiveChild());
  const [textbooks, setTextbooks] = useState([]);
  const [selectedTextbook, setSelectedTextbook] = useState(null);
  const [topics, setTopics] = useState([]);

  // Child Creation Form
  const [childName, setChildName] = useState('');
  const [childAge, setChildAge] = useState(9);
  const [childGrade, setChildGrade] = useState(4);
  const [childMascot, setChildMascot] = useState(STARTER_MASCOTS[0].name);

  // NCERT Fetch Form
  const [grade, setGrade] = useState(4);
  const [subject, setSubject] = useState('Maths');
  const [chapterNum, setChapterNum] = useState(1);
  const [pdfFile, setPdfFile] = useState(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Agent Steps Trace Modal
  const [selectedTopicSteps, setSelectedTopicSteps] = useState(null);
  const [traceLogs, setTraceLogs] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const kids = await api.getChildren();
      setChildren(kids);
      if (kids.length > 0 && !activeChild) {
        api.setActiveChild(kids[0]);
        setActiveChild(kids[0]);
      }
      const tbs = await api.getTextbooks();
      setTextbooks(tbs);
      if (tbs.length > 0) {
        setSelectedTextbook(tbs[0]);
        const topList = await api.getTopics(tbs[0].id);
        setTopics(topList);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectTextbook = async (tb) => {
    setSelectedTextbook(tb);
    try {
      const topList = await api.getTopics(tb.id);
      setTopics(topList);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateChild = async (e) => {
    e.preventDefault();
    try {
      setErrorMessage('');
      const kid = await api.createChild({
        name: childName,
        age: Number(childAge),
        grade: Number(childGrade),
        mascot_name: childMascot
      });
      setChildren([...children, kid]);
      api.setActiveChild(kid);
      setActiveChild(kid);
      setChildName('');
      setStatusMessage(`Created child profile for ${kid.name}!`);
    } catch (err) {
      setErrorMessage(err.message);
    }
  };

  const handleFetchAndChunk = async (e) => {
    e.preventDefault();
    setLoadingAction(true);
    setStatusMessage('Agent 1: Fetching NCERT PDF and analyzing chapter topics...');
    setErrorMessage('');

    try {
      const formData = new FormData();
      formData.append('grade', grade);
      formData.append('subject', subject);
      formData.append('chapter_num', chapterNum);
      if (pdfFile) {
        formData.append('file', pdfFile);
      }

      const res = await api.fetchAndChunk(formData);
      setStatusMessage(`Success! Chunked "${res.chapter_title}" into ${res.topics.length} topics.`);
      await loadData();
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleGenerateLesson = async (topicId) => {
    try {
      setStatusMessage('Starting Agent 2 (Lesson & Revision) and Agent 3 (Quiz & Retest) in background...');
      await api.generateLesson(topicId);
      // Refresh topics
      if (selectedTextbook) {
        const topList = await api.getTopics(selectedTextbook.id);
        setTopics(topList);
      }
      // Poll every 3 seconds until status is needs_review
      const interval = setInterval(async () => {
        if (selectedTextbook) {
          const fresh = await api.getTopics(selectedTextbook.id);
          setTopics(fresh);
          const t = fresh.find((item) => item.id === topicId);
          if (t && t.status !== 'generating') {
            clearInterval(interval);
            setStatusMessage(`Generation completed for topic: ${t.name}! Ready for parent review.`);
          }
        }
      }, 3000);
    } catch (err) {
      setErrorMessage(err.message);
    }
  };

  const handleViewTrace = async (topic) => {
    setSelectedTopicSteps(topic);
    try {
      const steps = await api.getAgentSteps(topic.id);
      setTraceLogs(steps);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '2.2rem', marginBottom: '8px' }}>Curriculum & Content Management</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Configure your child profiles, ingest official NCERT chapters, and review agent-generated lessons and quizzes.
        </p>
      </div>

      {statusMessage && (
        <div style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#6ee7b7', padding: '14px 20px', borderRadius: 'var(--radius-md)', marginBottom: '24px' }}>
          ✓ {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5', padding: '14px 20px', borderRadius: 'var(--radius-md)', marginBottom: '24px' }}>
          ⚠ {errorMessage}
        </div>
      )}

      {/* Grid: Child Setup & NCERT Ingest */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px', marginBottom: '36px' }}>
        {/* Child Profile Card */}
        <div className="glass-panel" style={{ padding: '28px' }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>👶</span> Child Profile Setup
          </h2>
          {children.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <label className="form-label">Active Child Profile:</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {children.map((k) => (
                  <button
                    key={k.id}
                    className={`btn ${activeChild?.id === k.id ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '8px 14px', fontSize: '0.85rem' }}
                    onClick={() => {
                      api.setActiveChild(k);
                      setActiveChild(k);
                    }}
                  >
                    {k.name} ({k.mascot_name}) · Grade {k.grade}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleCreateChild} style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Child Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Aarav"
                  required
                  value={childName}
                  onChange={(e) => setChildName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Age</label>
                <input
                  type="number"
                  className="form-input"
                  min="3"
                  max="18"
                  value={childAge}
                  onChange={(e) => setChildAge(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Grade Level</label>
                <select className="form-select" value={childGrade} onChange={(e) => setChildGrade(e.target.value)}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
                    <option key={g} value={g}>Grade {g}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Starter Mascot</label>
                <select className="form-select" value={childMascot} onChange={(e) => setChildMascot(e.target.value)}>
                  {STARTER_MASCOTS.map((m) => (
                    <option key={m.name} value={m.name}>{m.icon} {m.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <button type="submit" className="btn btn-secondary" style={{ width: '100%' }}>
              + Add Child Profile
            </button>
          </form>
        </div>

        {/* NCERT Fetch & Chunk Card */}
        <div className="glass-panel" style={{ padding: '28px' }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📚</span> Fetch NCERT Textbook Chapter
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '16px' }}>
            Agent 1 looks up the official catalog, extracts page text with pypdf, and splits the chapter into bite-sized topics.
          </p>

          <form onSubmit={handleFetchAndChunk}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Grade</label>
                <select className="form-select" value={grade} onChange={(e) => setGrade(Number(e.target.value))}>
                  <option value={4}>Grade 4</option>
                  <option value={5}>Grade 5</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Subject</label>
                <select className="form-select" value={subject} onChange={(e) => setSubject(e.target.value)}>
                  <option value="Maths">Maths</option>
                  <option value="Science">Science</option>
                  <option value="English">English</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Chapter</label>
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  max="20"
                  value={chapterNum}
                  onChange={(e) => setChapterNum(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Manual PDF Upload Fallback (Optional)</label>
              <input
                type="file"
                accept="application/pdf"
                className="form-input"
                onChange={(e) => setPdfFile(e.target.files[0])}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block', marginTop: '4px' }}>
                Upload official NCERT chapter PDF directly if download catalog entry is a placeholder.
              </span>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={loadingAction}
            >
              {loadingAction ? 'Processing Agent 1...' : 'Fetch & Chunk into Topics'}
            </button>
          </form>
        </div>
      </div>

      {/* Textbooks & Topics Section */}
      <div className="glass-panel" style={{ padding: '32px' }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: '20px' }}>Your Curriculum Chapters & Topics</h2>

        {textbooks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '1.1rem' }}>No textbooks fetched yet.</p>
            <p style={{ fontSize: '0.9rem', marginTop: '6px' }}>Select a grade and subject above to fetch your first chapter.</p>
          </div>
        ) : (
          <div>
            {/* Textbook Tabs */}
            <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px', marginBottom: '24px', overflowX: 'auto' }}>
              {textbooks.map((tb) => (
                <button
                  key={tb.id}
                  className={`btn ${selectedTextbook?.id === tb.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '8px 18px', fontSize: '0.9rem' }}
                  onClick={() => handleSelectTextbook(tb)}
                >
                  <span className={`badge badge-${tb.subject_tag.toLowerCase()}`}>{tb.subject_tag}</span>
                  {tb.title} (Grade {tb.grade} · {tb.page_count} pages)
                </button>
              ))}
            </div>

            {/* Topics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
              {topics.map((t) => (
                <div key={t.id} className="glass-panel-elevated" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span className={`badge badge-${t.subject_tag.toLowerCase()}`}>{t.subject_tag}</span>
                      <span className={`badge badge-status-${t.status}`}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>{t.name}</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
                      Pages {t.start_page} to {t.end_page} of {t.chapter_name}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
                    {t.status === 'chunked' && (
                      <button
                        className="btn btn-primary"
                        onClick={() => handleGenerateLesson(t.id)}
                      >
                        ⚡ Generate Lesson (Agents 2 & 3)
                      </button>
                    )}

                    {t.status === 'generating' && (
                      <button className="btn btn-secondary" disabled>
                        ⏳ AI Agents Generating...
                      </button>
                    )}

                    {(t.status === 'needs_review' || t.status === 'approved') && (
                      <button
                        className="btn btn-success"
                        onClick={() => navigate(`/review/${t.id}`)}
                      >
                        📋 Review & Approve Content
                      </button>
                    )}

                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.85rem', padding: '8px 12px' }}
                      onClick={() => handleViewTrace(t)}
                    >
                      🔍 View Agent Trace
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Agent Trace Modal */}
      {selectedTopicSteps && (
        <div className="modal-overlay" onClick={() => setSelectedTopicSteps(null)}>
          <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3>Agent Execution Trace: {selectedTopicSteps.name}</h3>
              <button className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setSelectedTopicSteps(null)}>✕</button>
            </div>

            {traceLogs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No steps logged for this topic yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {traceLogs.map((step, idx) => (
                  <div key={idx} style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <strong style={{ color: 'var(--color-primary-light)' }}>
                        Step {step.step_num}: {step.tool_name}
                      </strong>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{step.agent_name}</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{step.result_summary}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
