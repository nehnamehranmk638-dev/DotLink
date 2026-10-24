import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

const STARTER_MASCOTS = [
  { name: 'Leo the Lion', icon: '🦁', desc: 'Brave & Curious' },
  { name: 'Luna the Owl', icon: '🦉', desc: 'Wise & Focused' },
  { name: 'Sparky the Fox', icon: '🦊', desc: 'Clever & Quick' },
  { name: 'Astro the Penguin', icon: '🐧', desc: 'Patient & Explorer' }
];

const AVAILABLE_SUBJECTS = [
  'Maths',
  'English',
  'Science',
  'EVS',
  'Hindi',
  'Social Studies'
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

  // PDF Upload & Chunking Form
  const [grade, setGrade] = useState(4);
  const [subjectTag, setSubjectTag] = useState('Maths');
  const [pdfFile, setPdfFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Chapter Accordion State
  const [expandedChapters, setExpandedChapters] = useState({ 1: true });

  // Agent Steps Trace Modal
  const [selectedTopicSteps, setSelectedTopicSteps] = useState(null);
  const [traceLogs, setTraceLogs] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (activeChild?.grade) {
      setGrade(activeChild.grade);
    }
  }, [activeChild]);

  const loadData = async (targetTextbookId = null) => {
    try {
      const kids = await api.getChildren();
      setChildren(kids);
      if (kids.length > 0 && !activeChild) {
        api.setActiveChild(kids[0]);
        setActiveChild(kids[0]);
        setGrade(kids[0].grade || 4);
      }
      const tbs = await api.getTextbooks();
      setTextbooks(tbs);

      if (tbs.length > 0) {
        const toSelect = targetTextbookId
          ? tbs.find((b) => b.id === targetTextbookId) || tbs[0]
          : selectedTextbook
          ? tbs.find((b) => b.id === selectedTextbook.id) || tbs[0]
          : tbs[0];

        setSelectedTextbook(toSelect);
        const topList = await api.getTopics(toSelect.id);
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
      // Auto expand first chapter
      setExpandedChapters({ 1: true });
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
      setGrade(kid.grade || 4);
      setChildName('');
      setStatusMessage(`Created child profile for ${kid.name}!`);
    } catch (err) {
      setErrorMessage(err.message);
    }
  };

  const handleFileChange = (file) => {
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      if (!textbookTitle) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
        setTextbookTitle(cleanName);
      }
    } else if (file) {
      setErrorMessage('Please upload a valid PDF document.');
    }
  };

  const handleUploadAndChunk = async (e) => {
    e.preventDefault();
    if (!pdfFile) {
      setErrorMessage('Please select a textbook PDF file to upload.');
      return;
    }

    setLoadingAction(true);
    setStatusMessage('Agent 1: Extracting digital pages and chunking into Chapters & Sub-Topics...');
    setErrorMessage('');

    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      if (grade || activeChild?.grade) {
        formData.append('grade', grade || activeChild?.grade || 4);
      }
      formData.append('subject_tag', subjectTag);

      const res = await api.uploadAndChunkTextbook(formData);
      const chCount = res.chapters ? res.chapters.length : 1;
      const topCount = res.topics ? res.topics.length : 0;
      setStatusMessage(`Success! Organized "${res.title}" into ${chCount} Chapter(s) and ${topCount} Sub-Topics.`);
      
      // Reset upload input
      setPdfFile(null);

      // Reload textbooks and auto-select new textbook
      await loadData(res.textbook_id);
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
      if (selectedTextbook) {
        const topList = await api.getTopics(selectedTextbook.id);
        setTopics(topList);
      }

      // Poll every 3 seconds until status changes from 'generating'
      const interval = setInterval(async () => {
        if (selectedTextbook) {
          const fresh = await api.getTopics(selectedTextbook.id);
          setTopics(fresh);
          const t = fresh.find((item) => item.id === topicId);
          if (t && t.status !== 'generating') {
            clearInterval(interval);
            setStatusMessage(`Lesson generated for "${t.name}"! It is now live in Child Play Mode.`);
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

  const toggleChapter = (chapterNum) => {
    setExpandedChapters((prev) => ({
      ...prev,
      [chapterNum]: !prev[chapterNum]
    }));
  };

  // Group topics by chapter
  const groupedChapters = {};
  topics.forEach((t) => {
    const chNum = t.chapter_number || 1;
    const chTitle = t.chapter_title || t.chapter_name || `Chapter ${chNum}`;
    if (!groupedChapters[chNum]) {
      groupedChapters[chNum] = {
        chapter_number: chNum,
        chapter_title: chTitle,
        min_page: t.start_page,
        max_page: t.end_page,
        topics: []
      };
    }
    groupedChapters[chNum].topics.push(t);
    groupedChapters[chNum].min_page = Math.min(groupedChapters[chNum].min_page, t.start_page);
    groupedChapters[chNum].max_page = Math.max(groupedChapters[chNum].max_page, t.end_page);
  });
  const chaptersList = Object.values(groupedChapters).sort((a, b) => a.chapter_number - b.chapter_number);

  const getBadgeClass = (tag) => {
    const clean = (tag || '').toLowerCase().replace(/\s+/g, '_');
    return `badge badge-${clean}`;
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '2.2rem', marginBottom: '8px' }}>Curriculum & Content Management</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Upload digital textbook PDFs, let Agent 1 structure them into Chapters and Sub-Topics, and review generated interactive lessons.
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

      {/* Grid: Child Setup & PDF Upload */}
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
                      setGrade(k.grade || 4);
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

        {/* Upload & Chunk Textbook PDF Card */}
        <div className="glass-panel" style={{ padding: '28px' }}>
          <h2 style={{ fontSize: '1.3rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>📚</span> Upload Textbook PDF
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
            Upload your child's digital textbook PDF. Agent 1 will extract the pages, organize the book into Chapters, and break each chapter into bite-sized playable Sub-Topics.
          </p>

          <form onSubmit={handleUploadAndChunk}>
            {/* Subject Tag Selector */}
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label">Subject Tag:</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {AVAILABLE_SUBJECTS.map((sub) => {
                  const isSelected = subjectTag === sub;
                  return (
                    <button
                      type="button"
                      key={sub}
                      onClick={() => setSubjectTag(sub)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        border: isSelected ? '2px solid white' : '1px solid var(--border-subtle)',
                        background: isSelected ? 'var(--color-primary)' : 'rgba(30, 41, 59, 0.6)',
                        color: 'white',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {sub}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Drag & Drop File Zone */}
            <div className="form-group" style={{ marginBottom: '18px' }}>
              <label className="form-label">Textbook PDF Document (Required):</label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileChange(e.dataTransfer.files[0]);
                  }
                }}
                style={{
                  border: isDragging ? '2px dashed var(--color-primary)' : '2px dashed var(--border-subtle)',
                  background: isDragging ? 'rgba(99, 102, 241, 0.15)' : 'rgba(15, 23, 42, 0.4)',
                  borderRadius: 'var(--radius-md)',
                  padding: '24px 16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => document.getElementById('textbook-pdf-input')?.click()}
              >
                <input
                  id="textbook-pdf-input"
                  type="file"
                  accept="application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileChange(e.target.files?.[0])}
                />
                <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>📄</div>
                {pdfFile ? (
                  <div>
                    <strong style={{ color: 'var(--color-primary-light)', fontSize: '0.95rem' }}>
                      {pdfFile.name}
                    </strong>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {(pdfFile.size / (1024 * 1024)).toFixed(2)} MB · Click to replace
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '4px' }}>
                      Click or drag & drop textbook PDF here
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                      Supports single-chapter or multi-chapter digital PDFs with selectable text
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={loadingAction || !pdfFile}
            >
              {loadingAction ? 'Processing Agent 1...' : 'Upload & Chunk into Chapters & Topics'}
            </button>
          </form>
        </div>
      </div>

      {/* Hierarchical Chapters & Sub-Topics Section */}
      <div className="glass-panel" style={{ padding: '32px' }}>
        <h2 style={{ fontSize: '1.4rem', marginBottom: '20px' }}>Curriculum Chapters & Sub-Topics</h2>

        {textbooks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '1.1rem' }}>No textbooks uploaded yet.</p>
            <p style={{ fontSize: '0.9rem', marginTop: '6px' }}>Upload your child's textbook PDF above to start hierarchical chunking.</p>
          </div>
        ) : (
          <div>
            {/* Textbook Tabs */}
            <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px', marginBottom: '24px', overflowX: 'auto' }}>
              {textbooks.map((tb) => (
                <button
                  key={tb.id}
                  className={`btn ${selectedTextbook?.id === tb.id ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '8px 18px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                  onClick={() => handleSelectTextbook(tb)}
                >
                  <span className={getBadgeClass(tb.subject_tag)}>{tb.subject_tag}</span>
                  <span>{tb.title} (Grade {tb.grade} · {tb.page_count} pages)</span>
                </button>
              ))}
            </div>

            {/* Selected Textbook Info Header */}
            {selectedTextbook && (
              <div style={{ background: 'rgba(30, 41, 59, 0.4)', borderRadius: 'var(--radius-md)', padding: '16px 20px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <h3 style={{ fontSize: '1.25rem', margin: 0 }}>{selectedTextbook.title}</h3>
                    <span className={getBadgeClass(selectedTextbook.subject_tag)}>{selectedTextbook.subject_tag}</span>
                    <span className="badge" style={{ background: 'rgba(255,255,255,0.1)', color: '#cbd5e1' }}>Grade {selectedTextbook.grade}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {selectedTextbook.page_count} extracted pages · {chaptersList.length} Chapter(s) · {topics.length} playable Sub-Topic(s)
                  </div>
                </div>
              </div>
            )}

            {/* Hierarchical Chapter Accordion List */}
            {chaptersList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                No topics extracted yet for this textbook.
              </div>
            ) : (
              <div>
                {chaptersList.map((chapter) => {
                  const isExpanded = !!expandedChapters[chapter.chapter_number];
                  return (
                    <div key={chapter.chapter_number} className="chapter-accordion">
                      {/* Accordion Header */}
                      <div
                        className="chapter-accordion-header"
                        onClick={() => toggleChapter(chapter.chapter_number)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '1.1rem' }}>{isExpanded ? '📂' : '📁'}</span>
                          <div>
                            <strong style={{ fontSize: '1.05rem', color: 'white' }}>
                              Chapter {chapter.chapter_number}: {chapter.chapter_title}
                            </strong>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              Pages {chapter.min_page} to {chapter.max_page}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#c7d2fe' }}>
                            {chapter.topics.length} Sub-Topic{chapter.topics.length > 1 ? 's' : ''}
                          </span>
                          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            {isExpanded ? '▲' : '▼'}
                          </span>
                        </div>
                      </div>

                      {/* Accordion Body with Sub-Topic Cards */}
                      {isExpanded && (
                        <div className="chapter-accordion-body">
                          {chapter.topics.map((t) => (
                            <div
                              key={t.id}
                              className="glass-panel-elevated"
                              style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                            >
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                  <span className={getBadgeClass(t.subject_tag)}>{t.subject_tag}</span>
                                  <span className={`badge badge-status-${t.status}`}>
                                    {t.status.replace('_', ' ')}
                                  </span>
                                </div>

                                <h4 style={{ fontSize: '1.1rem', marginBottom: '6px' }}>
                                  Topic {t.chapter_number || chapter.chapter_number}.{t.topic_number || 1}: {t.name}
                                </h4>

                                <div style={{ fontSize: '0.78rem', color: 'var(--color-primary-light)', marginBottom: '8px' }}>
                                  Pages {t.start_page}–{t.end_page}
                                </div>

                                {t.description && (
                                  <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: '14px', lineHeight: '1.4' }}>
                                    {t.description}
                                  </p>
                                )}
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                                {t.status === 'chunked' && (
                                  <button
                                    className="btn btn-primary"
                                    onClick={() => handleGenerateLesson(t.id)}
                                  >
                                    ✨ Generate Lesson & Quiz
                                  </button>
                                )}

                                {t.status === 'generating' && (
                                  <button className="btn btn-secondary" disabled>
                                    ⏳ AI Agents Generating...
                                  </button>
                                )}

                                {(t.status === 'needs_review' || t.status === 'approved') && (
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                      className="btn btn-success"
                                      style={{ flex: 1 }}
                                      onClick={() => navigate('/play')}
                                    >
                                      ▶ Play in Child Mode
                                    </button>
                                    <button
                                      className="btn btn-secondary"
                                      style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                                      onClick={() => navigate(`/review/${t.id}`)}
                                      title="Preview script and quiz questions"
                                    >
                                      👁️ Preview
                                    </button>
                                  </div>
                                )}

                                <button
                                  className="btn btn-secondary"
                                  style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                                  onClick={() => handleViewTrace(t)}
                                >
                                  🔍 View Agent Steps
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '60vh', overflowY: 'auto' }}>
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
