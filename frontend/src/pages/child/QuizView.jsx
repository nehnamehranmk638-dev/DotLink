import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';

export default function QuizView() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [quizSet, setQuizSet] = useState('quiz_a'); // 'quiz_a' | 'quiz_b'
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answersLog, setAnswersLog] = useState([]);
  const [loading, setLoading] = useState(true);

  // Anti-Rushing Button Lock
  const [buttonLocked, setButtonLocked] = useState(true);
  const [lockCountdown, setLockCountdown] = useState(3);
  const [lockExpiryTimestamp, setLockExpiryTimestamp] = useState(null);

  // Current Question State
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [hintText, setHintText] = useState(null);
  const [explanationText, setExplanationText] = useState(null);
  const [evaluationFeedback, setEvaluationFeedback] = useState(null);

  // Result & Mastery Gate State
  const [quizResult, setQuizResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadQuiz(quizSet);
  }, [sessionId, quizSet]);

  const loadQuiz = async (set) => {
    setLoading(true);
    setQuizResult(null);
    setCurrentIdx(0);
    setAnswersLog([]);
    try {
      const token = localStorage.getItem('dotlink_token');
      const res = await fetch(`http://localhost:8000/sessions/${sessionId}/quiz-questions?quiz_set=${set}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const qList = await res.json();
      setQuestions(qList);
      if (qList.length > 0) {
        startQuestionLock(3);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const startQuestionLock = (seconds) => {
    setButtonLocked(true);
    setLockCountdown(seconds);
    const timer = setInterval(() => {
      setLockCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setButtonLocked(false);
          setLockExpiryTimestamp(Date.now());
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSelectOption = (opt) => {
    if (buttonLocked) return;
    const currentQ = questions[currentIdx];
    setSelectedAnswer(opt);

    const isCorrect = (opt.trim().toLowerCase() === currentQ.correct_answer.trim().toLowerCase());

    if (isCorrect) {
      setEvaluationFeedback('correct');
      // Record answer
      const logItem = {
        question_id: currentQ.id,
        selected_answer: opt,
        is_first_try_correct: (attemptNumber === 1)
      };
      const updatedLog = [...answersLog, logItem];
      setAnswersLog(updatedLog);

      setTimeout(() => {
        moveToNextQuestion(updatedLog);
      }, 1200);
    } else {
      if (attemptNumber === 1) {
        setEvaluationFeedback('wrong_first');
        setHintText(currentQ.hint_text);
        setAttemptNumber(2);
        // 2s lock on retry
        startQuestionLock(2);
      } else {
        setEvaluationFeedback('wrong_second');
        setExplanationText(currentQ.explanation_text);
        // Record as wrong
        const logItem = {
          question_id: currentQ.id,
          selected_answer: opt,
          is_first_try_correct: false
        };
        const updatedLog = [...answersLog, logItem];
        setAnswersLog(updatedLog);

        setTimeout(() => {
          moveToNextQuestion(updatedLog);
        }, 3000);
      }
    }
  };

  const moveToNextQuestion = (currentLog) => {
    setSelectedAnswer(null);
    setAttemptNumber(1);
    setHintText(null);
    setExplanationText(null);
    setEvaluationFeedback(null);

    const nextIdx = currentIdx + 1;
    if (nextIdx < questions.length) {
      setCurrentIdx(nextIdx);
      startQuestionLock(3);
    } else {
      submitCompleteQuiz(currentLog);
    }
  };

  const submitCompleteQuiz = async (finalAnswers) => {
    setSubmitting(true);
    try {
      const res = await api.submitQuiz(sessionId, {
        quiz_set: quizSet,
        answers: finalAnswers
      });
      setQuizResult(res);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const currentQ = questions[currentIdx];

  if (loading) {
    return (
      <div style={{ maxWidth: '800px', margin: '40px auto', padding: '24px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Preparing 10-Question Mastery Quiz...</p>
      </div>
    );
  }

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
                ⏳ Please read: Buttons unlock in {lockCountdown}s
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
                className="btn btn-secondary"
                disabled={buttonLocked}
                style={{
                  justifyContent: 'flex-start',
                  padding: '16px 20px',
                  fontSize: '1.05rem',
                  textAlign: 'left',
                  background: selectedAnswer === opt
                    ? evaluationFeedback === 'correct'
                      ? 'rgba(16, 185, 129, 0.3)'
                      : 'rgba(239, 68, 68, 0.3)'
                    : 'rgba(15, 23, 42, 0.6)',
                  borderColor: selectedAnswer === opt
                    ? evaluationFeedback === 'correct' ? '#10b981' : '#ef4444'
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
    </div>
  );
}
