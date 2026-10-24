import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useRemediationFlow } from '../../remediation';
import StudentInactivity from '../../components/StudentInactivity';

export default function QuizView() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [quizSet, setQuizSet] = useState('quiz_a');
  const [questions, setQuestions] = useState([]), [currentIdx, setCurrentIdx] = useState(0);
  const [answersLog, setAnswersLog] = useState([]), [loading, setLoading] = useState(true);
  const [lockCountdown, setLockCountdown] = useState(3);
  const [selectedAnswer, setSelectedAnswer] = useState(null), [attemptNumber, setAttemptNumber] = useState(1);
  const [hintText, setHintText] = useState(null), [explanationText, setExplanationText] = useState(null);
  const [evaluationFeedback, setEvaluationFeedback] = useState(null), [quizResult, setQuizResult] = useState(null);
  const [submitting, setSubmitting] = useState(false), [answerPending, setAnswerPending] = useState(false);
  const [idlePaused, setIdlePaused] = useState(false), [error, setError] = useState('');
  const requestInFlight = useRef(false), clock = useRef(0), practice = useRef(null), nextTimer = useRef(null);
  const flow = useRemediationFlow({ reduceMotion: localStorage.getItem('dotlink_reduce_motion') === 'true', soundEnabled: localStorage.getItem('dotlink_sound') === 'true' });
  const paused = flow.isRemediating || idlePaused || answerPending;
  const buttonLocked = lockCountdown > 0 || paused || evaluationFeedback === 'correct' || !!explanationText;
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setQuizResult(null); setCurrentIdx(0); setAnswersLog([]); setError('');
    api.getQuizQuestions(sessionId, quizSet).then(list => {
      if (!cancelled) { setQuestions(list); setLockCountdown(3); clock.current = 0; }
    }).catch(err => { if (!cancelled) setError(err.message); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; clearTimeout(nextTimer.current); };
  }, [sessionId, quizSet]);
  useEffect(() => {
    if (paused || loading || quizResult || evaluationFeedback === 'correct' || explanationText) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(), elapsed = (now - last) / 1000; last = now;
      if (lockCountdown > 0) setLockCountdown(value => Math.max(0, value - elapsed));
      else clock.current += elapsed;
    }, 100);
    return () => clearInterval(timer);
  }, [paused, loading, quizResult, lockCountdown, evaluationFeedback, explanationText]);
  useEffect(() => {
    if (paused || loading || quizResult || submitting) return;
    const timer = setInterval(() => api.postHeartbeat(sessionId).catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, [paused, loading, quizResult, submitting, sessionId]);
  const submitCompleteQuiz = async finalAnswers => {
    setSubmitting(true);
    try { setQuizResult(await api.submitQuiz(sessionId, { quiz_set: quizSet, answers: finalAnswers })); }
    catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  };
  const moveToNextQuestion = log => {
    setSelectedAnswer(null); setAttemptNumber(1); setHintText(null); setExplanationText(null); setEvaluationFeedback(null);
    practice.current = null; clock.current = 0;
    if (currentIdx + 1 < questions.length) { setCurrentIdx(currentIdx + 1); setLockCountdown(3); }
    else submitCompleteQuiz(log);
  };
  const handleSelectOption = async option => {
    if (buttonLocked || requestInFlight.current) return;
    const question = questions[currentIdx];
    setSelectedAnswer(option);
    // The extra attempt is ungraded practice. Original attempt records and mastery score stay unchanged.
    if (practice.current) {
      setExplanationText(practice.current.explanation_text || question.explanation_text);
      setEvaluationFeedback('explained'); practice.current = null; return;
    }
    requestInFlight.current = true; setAnswerPending(true); setError('');
    try {
      const response = await api.adaptiveInteract({ session_id: sessionId, interaction_type: 'answer_submit',
        question_id: question.id, selected_answer: option, attempt_number: attemptNumber, time_taken: Math.min(300, Math.max(.1, clock.current)) });
      if (response.can_retry) {
        setHintText(response.hint_text); setAttemptNumber(2); setEvaluationFeedback('hint'); setLockCountdown(2); clock.current = 0;
      } else {
        const log = [...answersLog, { question_id: question.id, selected_answer: option, is_first_try_correct: attemptNumber === 1 && response.is_correct }];
        setAnswersLog(log);
        if (flow.triggerRemediation(response, () => {
          practice.current = response; setSelectedAnswer(null); setHintText(null); setEvaluationFeedback('practice'); setLockCountdown(2); clock.current = 0;
        }, { sessionId, quizSet, questionId: question.id })) { setEvaluationFeedback('remediation'); return; }
        if (response.is_correct) { setEvaluationFeedback('correct'); nextTimer.current = setTimeout(() => moveToNextQuestion(log), 1400); }
        else { setExplanationText(response.explanation_text); setEvaluationFeedback('explained'); }
      }
    } catch (err) { setError(err.message); }
    finally { requestInFlight.current = false; setAnswerPending(false); }
  };
  const currentQ = questions[currentIdx];
  if (loading) return <p style={{ padding: 32 }}>Preparing your quiz…</p>;

  // -------------------------------------------------------------
  // Result View (Mastery Gate >= 7 Pass vs < 7 Full Revision + Retest)
  // -------------------------------------------------------------
  if (quizResult) {
    const passed = quizResult.passed;
    const isSetB = (quizSet === 'quiz_b');

    return (
      <div style={{ maxWidth: '800px', margin: '32px auto', padding: '24px' }}>
        <div
          className="glass-panel-elevated"
          style={{
            padding: '40px',
            textAlign: 'center',
            border: passed ? '2px solid #10b981' : '2px solid #f59e0b',
            background: passed
              ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(30, 41, 59, 0.9) 100%)'
              : 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(30, 41, 59, 0.9) 100%)'
          }}
        >
          <div style={{ fontSize: '4rem', marginBottom: '16px' }}>
            {passed ? '🏆' : '📚'}
          </div>

          <h1 style={{ fontSize: '2.4rem', marginBottom: '12px' }}>
            {passed ? 'Topic Mastered!' : isSetB ? 'Retest Complete' : 'Revision Required'}
          </h1>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 28px',
              borderRadius: 'var(--radius-full)',
              background: passed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
              marginBottom: '24px',
              fontSize: '1.4rem',
              fontWeight: 800,
              color: passed ? '#34d399' : '#fbbf24'
            }}
          >
            Score: {quizResult.score_out_of_10} / 10
            {passed ? ' (Passed ≥ 7/10)' : ' (Needs ≥ 7/10 to pass)'}
          </div>

          {passed && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontSize: '1.2rem', color: '#fbbf24', fontWeight: 700, marginBottom: '28px' }}>
              <span>⭐</span> +10 Mastery Bonus Stars Awarded! <span>⭐</span>
            </div>
          )}

          {/* Corrections for missed items */}
          {quizResult.corrections && quizResult.corrections.length > 0 && (
            <div style={{ textAlign: 'left', marginTop: '24px', marginBottom: '32px' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '14px', color: 'var(--text-main)' }}>
                Review Your Corrections:
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {quizResult.corrections.map((item, idx) => (
                  <div key={idx} style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <strong style={{ fontSize: '0.95rem' }}>{item.question_text}</strong>
                      <span className="badge badge-primary">page {item.source_page}</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#6ee7b7', marginBottom: '4px' }}>
                      ✓ Correct Answer: <strong>{item.correct_answer}</strong>
                    </p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      📘 {item.explanation_text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Retest Flow (< 7 on Set A): Full Revision Module + Set B launch */}
          {!passed && quizResult.launch_quiz_b && quizResult.full_revision_module && (
            <div style={{ textAlign: 'left', marginTop: '24px', marginBottom: '36px', background: 'rgba(15, 23, 42, 0.8)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
              <h2 style={{ fontSize: '1.3rem', color: '#fbbf24', marginBottom: '12px' }}>
                Full Revision Module
              </h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Study these key takeaways before taking your Retest Quiz (Set B — 10 new questions):
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                {quizResult.full_revision_module.all_bullets.map((b, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span style={{ color: '#fbbf24', fontWeight: 800 }}>•</span>
                    <span style={{ fontSize: '0.9rem' }}>{b.text}</span>
                  </div>
                ))}
              </div>

              <button
                className="btn btn-primary btn-lg"
                style={{ width: '100%', background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                onClick={() => {
                  setQuizSet('quiz_b');
                }}
              >
                🚀 Launch Retest Quiz Set B (10 New Questions) →
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
            <button className="btn btn-secondary" onClick={() => navigate('/play')}>
              🎮 Back to Student Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Live 10-Question Quiz View
  // -------------------------------------------------------------
  return (
    <div style={{ maxWidth: '800px', margin: '24px auto', padding: '20px' }}>
      {flow.remediationPopup}
      <StudentInactivity paused={flow.isRemediating || !!quizResult || submitting || loading}
        onPause={() => setIdlePaused(true)}
        onResume={() => { setIdlePaused(false); api.postIdle(sessionId, { responded: true }).catch(() => {}); }}
        onAutoPause={() => { api.postIdle(sessionId, { responded: false }).catch(() => {}); navigate('/play'); }} />
      {error && <p role="alert">{error}</p>}
      <div inert={flow.isRemediating || idlePaused ? true : undefined}>
      {evaluationFeedback === 'correct' && <p role="status" style={{ fontSize: 24 }}>🎉 Nice work! You’ve got it!</p>}
      {evaluationFeedback === 'practice' && <p role="status">Let’s try the same question with our new steps.</p>}
      {/* Top Progress Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <button className="btn btn-secondary" style={{ padding: '6px 14px' }} onClick={() => navigate('/play')}>
          ← Exit Quiz
        </button>
        <span className="badge badge-primary" style={{ fontSize: '0.85rem' }}>
          {quizSet === 'quiz_a' ? 'Set A: Mastery Evaluation' : 'Set B: Post-Revision Retest'}
        </span>
        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-muted)' }}>
          Question {currentIdx + 1} of {questions.length}
        </span>
      </div>

      {/* Progress Dots */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', justifyContent: 'center' }}>
        {questions.map((_, idx) => (
          <div
            key={idx}
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: idx === currentIdx
                ? '#ec4899'
                : idx < answersLog.length
                ? answersLog[idx]?.is_first_try_correct ? '#10b981' : '#f59e0b'
                : 'rgba(255, 255, 255, 0.2)',
              transition: 'all 0.3s'
            }}
          />
        ))}
      </div>

      {/* Question Card */}
      {currentQ && (
        <div className="glass-panel-elevated" style={{ padding: '36px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <span className="badge badge-science">Question {currentIdx + 1}</span>
            {buttonLocked && (
              <span className="badge badge-warning" style={{ background: '#f59e0b', color: '#111827' }}>
                ⏳ Please read: Take a moment to read
              </span>
            )}
          </div>

          <h2 style={{ fontSize: '1.4rem', lineHeight: '1.6', marginBottom: '24px' }}>
            {currentQ.question_text}
          </h2>

          {hintText && (
            <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid #f59e0b', color: '#fde68a', padding: '14px', borderRadius: 'var(--radius-sm)', marginBottom: '20px', fontSize: '0.95rem' }}>
              💡 <strong>Hint:</strong> {hintText}
            </div>
          )}

          {explanationText && (
            <div style={{ background: 'rgba(56, 189, 248, 0.15)', border: '1px solid #38bdf8', color: '#bae6fd', padding: '14px', borderRadius: 'var(--radius-sm)', marginBottom: '20px', fontSize: '0.95rem' }}>
              📘 <strong>Explanation:</strong> {explanationText}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {currentQ.options.map((opt, idx) => (
              <button
                key={idx}
                id={`${currentQ.id}-option-${idx}`}
                className={`btn btn-secondary quiz-option ${flow.highlightedId === `${currentQ.id}-option-${idx}` ? 'aha-glow' : ''}`}
                disabled={buttonLocked}
                style={{
                  justifyContent: 'flex-start',
                  padding: '16px 20px',
                  fontSize: '1.05rem',
                  textAlign: 'left',
                  background: selectedAnswer === opt
                    ? evaluationFeedback === 'correct'
                      ? 'rgba(16, 185, 129, 0.3)'
                      : 'rgba(164, 183, 134, 0.2)'
                    : 'rgba(15, 23, 42, 0.6)',
                  borderColor: selectedAnswer === opt
                    ? evaluationFeedback === 'correct' ? '#10b981' : '#a4b786'
                    : 'var(--border-subtle)'
                }}
                onClick={() => handleSelectOption(opt)}
              >
                <strong style={{ marginRight: '14px', color: 'var(--color-primary-light)' }}>
                  {String.fromCharCode(65 + idx)}.
                </strong>
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}
      {explanationText && <button className="btn btn-primary" style={{ minHeight: 56, marginTop: 24 }} onClick={() => moveToNextQuestion(answersLog)}>Continue →</button>}
      </div>
    </div>
  );
}
