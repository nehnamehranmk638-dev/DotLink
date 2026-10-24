import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';

export default function CurriculumReview() {
  const { topicId } = useParams();
  const navigate = useNavigate();

  const [topic, setTopic] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [sourcePages, setSourcePages] = useState({});
  const [activeTab, setActiveTab] = useState('scenes'); // 'scenes' | 'bullets' | 'quiz_a' | 'quiz_b' | 'in_video'
  const [selectedSourcePopover, setSelectedSourcePopover] = useState(null);

  // Edit Question Modal State
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [editQText, setEditQText] = useState('');
  const [editOptions, setEditOptions] = useState([]);
  const [editCorrectAnswer, setEditCorrectAnswer] = useState('');
  const [editHint, setEditHint] = useState('');
  const [editExplanation, setEditExplanation] = useState('');
  const [editSourcePage, setEditSourcePage] = useState(1);

  // Status & Feedback
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    loadTopicData();
  }, [topicId]);

  const loadTopicData = async () => {
    try {
      const t = await api.getTopic(topicId);
      setTopic(t);

      const b = await api.getLessonBundle(topicId);
      setBundle(b);

      const q = await api.getQuestions(topicId);
      setQuestions(q);

      const sp = await api.getSourcePages(topicId);
      const spMap = {};
      sp.forEach((p) => {
        spMap[p.page_number] = p.text;
      });
      setSourcePages(spMap);
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleOpenEdit = (q) => {
    setEditingQuestion(q);
    setEditQText(q.question_data.question_text || '');
    setEditOptions(q.question_data.options || []);
    setEditCorrectAnswer(q.correct_answer || '');
    setEditHint(q.hint_text || '');
    setEditExplanation(q.explanation_text || '');
    setEditSourcePage(q.source_page || 1);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    try {
      await api.patchQuestion(editingQuestion.id, {
        question_text: editQText,
        options: editOptions,
        correct_answer: editCorrectAnswer,
        hint_text: editHint,
        explanation_text: editExplanation,
        source_page: Number(editSourcePage)
      });
      setEditingQuestion(null);
      setStatusMsg('Question updated and flagged state resolved!');
      await loadTopicData();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleDeleteQuestion = async (qId) => {
    if (!window.confirm('Are you sure? Remember, Quiz Set A and Set B each require exactly 10 questions to approve.')) {
      return;
    }
    try {
      await api.deleteQuestion(qId);
      setStatusMsg('Question deleted.');
      await loadTopicData();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      await api.approveTopic(topicId);
      setStatusMsg('Topic approved successfully! It is now live on the Student Dashboard.');
      setTimeout(() => {
        navigate('/curriculum');
      }, 1500);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setApproving(false);
    }
  };

  const quizASet = questions.filter((q) => q.question_type === 'quiz_a');
  const quizBSet = questions.filter((q) => q.question_type === 'quiz_b');
  const inVideoQuestions = questions.filter((q) => q.question_type === 'in_video');

  const canApprove = quizASet.length === 10 && quizBSet.length === 10;

  if (!topic || !bundle) {
    return (
      <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Loading topic review data...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <button className="btn btn-secondary" style={{ padding: '6px 14px', marginBottom: '12px' }} onClick={() => navigate('/curriculum')}>
            ← Back to Curriculum
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '2rem' }}>Review: {topic.name}</h1>
            <span className={`badge badge-status-${topic.status}`}>{topic.status.replace('_', ' ')}</span>
          </div>
          <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>
            {topic.chapter_name} (Pages {topic.start_page} to {topic.end_page})
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {topic.status === 'approved' ? (
            <button
              className="btn btn-primary btn-lg"
              onClick={() => navigate('/play')}
            >
              ▶ Play in Child Mode
            </button>
          ) : (
            <button
              className="btn btn-success btn-lg"
              onClick={handleApprove}
              disabled={approving}
            >
              ✓ Approve Topic
            </button>
          )}
        </div>
      </div>

      {statusMsg && (
        <div style={{ background: 'rgba(16, 185, 129, 0.2)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#6ee7b7', padding: '14px 20px', borderRadius: 'var(--radius-md)', marginBottom: '24px' }}>
          ✓ {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5', padding: '14px 20px', borderRadius: 'var(--radius-md)', marginBottom: '24px' }}>
          ⚠ {errorMsg}
        </div>
      )}

      {/* Warning banner if questions count is not 10 each */}
      {!canApprove && (
        <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', color: '#fde68a', padding: '14px 20px', borderRadius: 'var(--radius-md)', marginBottom: '24px', fontSize: '0.9rem' }}>
          <strong>Notice:</strong> Quiz Set A has {quizASet.length}/10 questions, and Quiz Set B has {quizBSet.length}/10 questions.
          Both sets must have exactly 10 questions before approval is permitted.
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px', overflowX: 'auto' }}>
        <button
          className={`btn ${activeTab === 'scenes' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('scenes')}
        >
          🎬 Animated Scenes ({bundle.scenes_json.length})
        </button>
        <button
          className={`btn ${activeTab === 'bullets' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('bullets')}
        >
          📝 Revision Bullets ({bundle.revision_bullets_json.length})
        </button>
        <button
          className={`btn ${activeTab === 'in_video' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('in_video')}
        >
          💡 Mid-Video Questions ({inVideoQuestions.length})
        </button>
        <button
          className={`btn ${activeTab === 'quiz_a' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('quiz_a')}
        >
          🎯 Quiz Set A ({quizASet.length}/10)
        </button>
        <button
          className={`btn ${activeTab === 'quiz_b' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('quiz_b')}
        >
          🔄 Retest Quiz Set B ({quizBSet.length}/10)
        </button>
      </div>

      {/* Tab: Scenes */}
      {activeTab === 'scenes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {bundle.scenes_json.map((s, idx) => (
            <div key={idx} className="glass-panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="badge badge-primary">Scene {s.scene_num}</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>SpeechSynthesis Narration</span>
              </div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '12px' }}>{s.title}</h3>
              <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '14px', borderRadius: 'var(--radius-sm)', marginBottom: '14px', borderLeft: '4px solid var(--color-primary)' }}>
                <strong style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-primary-light)', marginBottom: '4px' }}>VISUAL DESCRIPTION:</strong>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{s.visual_description}</p>
              </div>
              <div>
                <strong style={{ display: 'block', fontSize: '0.8rem', color: '#a5b4fc', marginBottom: '4px' }}>NARRATION SCRIPT:</strong>
                <p style={{ fontSize: '1rem', lineHeight: '1.6' }}>{s.narration_text}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Revision Bullets */}
      {activeTab === 'bullets' && (
        <div className="glass-panel" style={{ padding: '28px' }}>
          <h3 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Progressive Bullet-Point Revision Sheet</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px' }}>
            These key takeaways unlock one by one as the child watches scenes and clicks pulsing active-listening words.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {bundle.revision_bullets_json.map((b, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', background: 'rgba(15, 23, 42, 0.5)', padding: '14px 18px', borderRadius: 'var(--radius-sm)' }}>
                <span className="badge badge-science">Point {b.bullet_num}</span>
                <div>
                  <p style={{ fontSize: '0.95rem' }}>{b.text}</p>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Linked to Scene {b.scene_num}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '32px', paddingTop: '20px', borderTop: '1px solid var(--border-subtle)' }}>
            <h4 style={{ fontSize: '1.1rem', marginBottom: '12px' }}>Topic Mini-Game Config (Matching Pairs)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
              {(bundle.mini_game_config?.pairs || []).map((p, idx) => (
                <div key={idx} style={{ background: 'rgba(30, 41, 59, 0.8)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                  <strong style={{ color: '#ec4899' }}>{p.left}</strong> ➔ <span>{p.right}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Mid-Video Questions, Quiz A, Quiz B */}
      {['in_video', 'quiz_a', 'quiz_b'].includes(activeTab) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {questions
            .filter((q) => q.question_type === activeTab)
            .map((q, idx) => (
              <div
                key={q.id}
                className="glass-panel"
                style={{
                  padding: '24px',
                  border: q.flagged ? '2px solid #ef4444' : '1px solid var(--border-subtle)',
                  background: q.flagged ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-surface)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span className="badge badge-primary">Q{idx + 1}</span>
                    {q.flagged && (
                      <span className="badge badge-status-generating" style={{ background: '#ef4444', color: 'white' }}>
                        ⚠ Flagged by Code Backstop
                      </span>
                    )}
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '3px 10px', fontSize: '0.8rem' }}
                      onClick={() => setSelectedSourcePopover({ page: q.source_page, text: sourcePages[q.source_page] })}
                    >
                      📖 from page {q.source_page}
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={() => handleOpenEdit(q)}>
                      ✏ Edit
                    </button>
                    <button className="btn btn-danger" style={{ padding: '6px 14px', fontSize: '0.85rem' }} onClick={() => handleDeleteQuestion(q.id)}>
                      🗑 Delete
                    </button>
                  </div>
                </div>

                {q.flagged && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: '8px 12px', borderRadius: 'var(--radius-sm)', marginBottom: '12px', fontSize: '0.85rem' }}>
                    <strong>Flag Reason:</strong> {q.flag_reason}
                  </div>
                )}

                <h4 style={{ fontSize: '1.1rem', marginBottom: '14px', lineHeight: '1.5' }}>
                  {q.question_data.question_text}
                </h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                  {(q.question_data.options || []).map((opt, oIdx) => (
                    <div
                      key={oIdx}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-sm)',
                        background: opt === q.correct_answer ? 'rgba(16, 185, 129, 0.25)' : 'rgba(15, 23, 42, 0.5)',
                        border: opt === q.correct_answer ? '1px solid #10b981' : '1px solid var(--border-subtle)',
                        fontSize: '0.9rem',
                        color: opt === q.correct_answer ? '#6ee7b7' : 'var(--text-main)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span>{opt}</span>
                      {opt === q.correct_answer && <span>✓ Correct</span>}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  <div>
                    <strong style={{ color: '#f59e0b' }}>1st Wrong Hint:</strong> {q.hint_text}
                  </div>
                  <div>
                    <strong style={{ color: '#38bdf8' }}>2nd Wrong Explanation:</strong> {q.explanation_text}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Source Page Text Popover Modal */}
      {selectedSourcePopover && (
        <div className="modal-overlay" onClick={() => setSelectedSourcePopover(null)}>
          <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3>NCERT Textbook Page {selectedSourcePopover.page} Text</h3>
              <button className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setSelectedSourcePopover(null)}>✕</button>
            </div>
            <div style={{ background: 'rgba(15, 23, 42, 0.8)', padding: '18px', borderRadius: 'var(--radius-sm)', maxHeight: '60vh', overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: '1.6', fontSize: '0.9rem', color: '#e2e8f0' }}>
              {selectedSourcePopover.text || 'No text extracted for this page.'}
            </div>
          </div>
        </div>
      )}

      {/* Edit Question Modal */}
      {editingQuestion && (
        <div className="modal-overlay" onClick={() => setEditingQuestion(null)}>
          <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3>Edit Question (Page {editSourcePage})</h3>
              <button className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setEditingQuestion(null)}>✕</button>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div className="form-group">
                <label className="form-label">Question Text</label>
                <textarea
                  className="form-input"
                  rows="3"
                  required
                  value={editQText}
                  onChange={(e) => setEditQText(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Options (one per line, 2-4 lines)</label>
                <textarea
                  className="form-input"
                  rows="4"
                  required
                  value={editOptions.join('\n')}
                  onChange={(e) => setEditOptions(e.target.value.split('\n').filter((l) => l.trim()))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Correct Answer (must match one option exactly)</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={editCorrectAnswer}
                  onChange={(e) => setEditCorrectAnswer(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Hint Text (1st wrong attempt)</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={editHint}
                  onChange={(e) => setEditHint(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Explanation Text (2nd wrong attempt)</label>
                <textarea
                  className="form-input"
                  rows="2"
                  required
                  value={editExplanation}
                  onChange={(e) => setEditExplanation(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Source Page Number</label>
                <input
                  type="number"
                  className="form-input"
                  required
                  value={editSourcePage}
                  onChange={(e) => setEditSourcePage(Number(e.target.value))}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingQuestion(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes & Clear Flags
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
