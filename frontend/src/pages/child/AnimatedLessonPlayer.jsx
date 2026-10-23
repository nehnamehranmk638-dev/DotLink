import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';

export default function AnimatedLessonPlayer() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // Session & Bundle State
  const [session, setSession] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [currentSceneIdx, setCurrentSceneIdx] = useState(0);
  const [highlightedWords, setHighlightedWords] = useState([]);
  const [revisionBullets, setRevisionBullets] = useState([]);
  const [unlockedBullets, setUnlockedBullets] = useState([]);
  const [inVideoQuestions, setInVideoQuestions] = useState([]);
  const [activeQuestion, setActiveQuestion] = useState(null);

  // Resume Modal State (Acceptance Check: Shows unlocked bullets FIRST on resume)
  const [showResumeModal, setShowResumeModal] = useState(false);

  // Audio / SpeechSynthesis State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);

  // Live Revision Sheet Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [justUnlockedIndex, setJustUnlockedIndex] = useState(null);

  // Question Button Lock Countdown (3s lock)
  const [buttonLocked, setButtonLocked] = useState(false);
  const [lockCountdown, setLockCountdown] = useState(0);
  const [lockExpiryTimestamp, setLockExpiryTimestamp] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [hintText, setHintText] = useState(null);
  const [explanationText, setExplanationText] = useState(null);
  const [evaluationFeedback, setEvaluationFeedback] = useState(null);

  // Low Engagement Mini-Game Modal State
  const [miniGameOpen, setMiniGameOpen] = useState(false);
  const [miniGamePairs, setMiniGamePairs] = useState([]);
  const [gameSelectedLeft, setGameSelectedLeft] = useState(null);
  const [gameMatchedPairs, setGameMatchedPairs] = useState(new Set());
  const [miniGameTimeLeft, setMiniGameTimeLeft] = useState(60);

  // Idle Timer / Heartbeat
  const [showIdleModal, setShowIdleModal] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(30);
  const lastInteractionRef = useRef(Date.now());

  useEffect(() => {
    initSession();
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [sessionId]);

  const initSession = async () => {
    try {
      const activeKid = api.getActiveChild();
      // Fetch session directly or start/resume
      const token = localStorage.getItem('dotlink_token');
      const res = await fetch(`http://localhost:8000/sessions/start-or-resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ child_id: activeKid.id, topic_id: 'auto' }) // Handled via existing session lookup
      }).catch(() => null);

      // Fetch session from db via router
      const sessData = await fetchSessionData();
      if (!sessData) return;

      setSession(sessData);
      setScenes(sessData.scenes || []);
      setRevisionBullets(sessData.revision_bullets || []);
      setUnlockedBullets(sessData.unlocked_bullets || []);
      setHighlightedWords(sessData.highlighted_words || []);
      setInVideoQuestions(sessData.in_video_questions || []);

      // If resuming after a pause and has unlocked bullets or last_scene_index > 0
      if (sessData.is_resume && (sessData.unlocked_bullets.length > 0 || sessData.last_scene_index > 0)) {
        setShowResumeModal(true);
        setCurrentSceneIdx(sessData.last_scene_index || 0);
      } else {
        setCurrentSceneIdx(0);
        speakScene(sessData.scenes[0]?.narration_text);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchSessionData = async () => {
    const token = localStorage.getItem('dotlink_token');
    const res = await fetch(`http://localhost:8000/sessions/${sessionId}/details`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      // Direct fallback
      return null;
    }
    return res.json();
  };

  // Speak Narration using Web SpeechSynthesis API
  const speakScene = (text) => {
    if (!text || !('speechSynthesis' in window)) {
      setSpeechSupported(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.05;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const handleStopSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const handleReplayNarration = () => {
    const scene = scenes[currentSceneIdx];
    if (scene) speakScene(scene.narration_text);
  };

  // Check 1: Click Highlighted Word
  const handleWordClick = async (wordObj) => {
    lastInteractionRef.current = Date.now();
    try {
      const res = await api.adaptiveInteract({
        session_id: sessionId,
        interaction_type: 'highlight_click',
        word: wordObj.word,
        scene_num: currentSceneIdx + 1
      });

      if (res.unlocked_bullet) {
        setUnlockedBullets((prev) => [...prev, res.unlocked_bullet]);
        setJustUnlockedIndex(unlockedBullets.length);
        setDrawerOpen(true);
        // Play brief positive chime if audio context available
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
          osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
          osc.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.25);
        } catch (e) {}
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Check 2: Mid-Lesson Questions with Anti-Rushing Lock
  const triggerQuestionModal = (q) => {
    handleStopSpeaking();
    setActiveQuestion(q);
    setSelectedAnswer(null);
    setAttemptNumber(1);
    setHintText(null);
    setExplanationText(null);
    setEvaluationFeedback(null);

    // Anti-rushing lock: 3 seconds countdown
    setButtonLocked(true);
    setLockCountdown(3);
    const lockTimer = setInterval(() => {
      setLockCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(lockTimer);
          setButtonLocked(false);
          setLockExpiryTimestamp(Date.now());
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleAnswerSubmit = async (ans) => {
    if (buttonLocked || !activeQuestion) return;
    lastInteractionRef.current = Date.now();
    setSelectedAnswer(ans);

    const timeTaken = lockExpiryTimestamp ? Math.max(0.1, (Date.now() - lockExpiryTimestamp) / 1000) : 1.5;

    try {
      const res = await api.adaptiveInteract({
        session_id: sessionId,
        interaction_type: 'answer_submit',
        question_id: activeQuestion.id,
        selected_answer: ans,
        attempt_number: attemptNumber,
        time_taken: timeTaken
      });

      if (res.is_correct) {
        setEvaluationFeedback('correct');
        if (res.unlocked_bullet) {
          setUnlockedBullets((prev) => [...prev, res.unlocked_bullet]);
        }
        setTimeout(() => {
          setActiveQuestion(null);
          goToNextScene();
        }, 1500);
      } else {
        if (res.can_retry) {
          setEvaluationFeedback('wrong_first');
          setHintText(res.hint_text);
          setAttemptNumber(2);
          // 2 seconds lock before retry
          setButtonLocked(true);
          setLockCountdown(2);
          const rTimer = setInterval(() => {
            setLockCountdown((prev) => {
              if (prev <= 1) {
                clearInterval(rTimer);
                setButtonLocked(false);
                setLockExpiryTimestamp(Date.now());
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        } else {
          setEvaluationFeedback('wrong_second');
          setExplanationText(res.explanation_text);
          setTimeout(() => {
            setActiveQuestion(null);
            goToNextScene();
          }, 3500);
        }
      }

      if (res.trigger_mini_game && res.mini_game_config?.pairs) {
        // Trigger 60s Match-the-Pairs Mini-Game
        setMiniGamePairs(res.mini_game_config.pairs);
        setGameMatchedPairs(new Set());
        setMiniGameTimeLeft(60);
        setMiniGameOpen(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const goToNextScene = async () => {
    handleStopSpeaking();
    const nextIdx = currentSceneIdx + 1;
    if (nextIdx < scenes.length) {
      // Check if there is an in-video question scheduled after this scene
      const questionForScene = inVideoQuestions.find((q) => q.scene_num === currentSceneIdx + 1);
      if (questionForScene && !activeQuestion) {
        triggerQuestionModal(questionForScene);
        return;
      }

      setCurrentSceneIdx(nextIdx);
      speakScene(scenes[nextIdx]?.narration_text);
      // Save position to server
      const token = localStorage.getItem('dotlink_token');
      await fetch(`http://localhost:8000/sessions/${sessionId}/update-scene`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scene_index: nextIdx })
      }).catch(() => {});
    } else {
      // Lesson finished -> Launch Quiz Set A
      navigate(`/play/quiz/${sessionId}`);
    }
  };

  const handlePauseAndExit = async () => {
    handleStopSpeaking();
    const token = localStorage.getItem('dotlink_token');
    await fetch(`http://localhost:8000/sessions/${sessionId}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scene_index: currentSceneIdx })
    }).catch(() => {});
    navigate('/play');
  };

  const currentScene = scenes[currentSceneIdx];

  // Highlight word replacement helper
  const renderInteractiveNarration = (text) => {
    if (!text) return null;
    let parts = [text];
    highlightedWords.forEach((hw) => {
      const regex = new RegExp(`\\b(${hw.word})\\b`, 'gi');
      const newParts = [];
      parts.forEach((p) => {
        if (typeof p === 'string') {
          const split = p.split(regex);
          for (let i = 0; i < split.length; i++) {
            if (split[i].toLowerCase() === hw.word.toLowerCase()) {
              newParts.push(
                <span
                  key={`${hw.word}-${i}`}
                  className="pulsing-word"
                  title={`Key Concept: ${hw.key_point}. Click to add to your Revision Sheet!`}
                  onClick={() => handleWordClick(hw)}
                >
                  ✨ {split[i]}
                </span>
              );
            } else if (split[i]) {
              newParts.push(split[i]);
            }
          }
        } else {
          newParts.push(p);
        }
      });
      parts = newParts;
    });
    return parts;
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px', position: 'relative' }}>
      {/* Top Session Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <button className="btn btn-secondary" onClick={handlePauseAndExit}>
          ⏸ Pause & Save Lesson
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '0.95rem', color: 'var(--text-muted)' }}>
            Scene {currentSceneIdx + 1} of {scenes.length || 4}
          </span>
          <button
            className="btn btn-primary"
            style={{ padding: '8px 16px', position: 'relative' }}
            onClick={() => setDrawerOpen(true)}
          >
            📋 Revision Sheet ({unlockedBullets.length}/{revisionBullets.length})
            {justUnlockedIndex !== null && (
              <span style={{ position: 'absolute', top: '-6px', right: '-6px', width: '12px', height: '12px', borderRadius: '50%', background: '#ec4899', border: '2px solid white' }} />
            )}
          </button>
        </div>
      </div>

      {/* Main Animated Scene Card */}
      {currentScene ? (
        <div className="glass-panel-elevated" style={{ padding: '36px', minHeight: '480px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {/* Animated Visual Stage */}
          <div
            style={{
              height: '240px',
              borderRadius: 'var(--radius-lg)',
              background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
              border: '2px solid rgba(165, 180, 252, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
              marginBottom: '28px',
              boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5)'
            }}
          >
            {/* SVG Animated Graphic */}
            <div style={{ position: 'absolute', inset: 0, opacity: 0.15 }}>
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="1"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>

            <div style={{ textAlign: 'center', zIndex: 1, padding: '20px' }}>
              <div style={{ fontSize: '3rem', marginBottom: '8px', filter: 'drop-shadow(0 4px 12px rgba(236,72,153,0.5))' }}>
                {currentSceneIdx === 0 ? '🏰' : currentSceneIdx === 1 ? '🧱' : currentSceneIdx === 2 ? '📐' : '🌟'}
              </div>
              <h2 style={{ fontSize: '1.8rem', color: '#ffffff', marginBottom: '8px' }}>
                {currentScene.title}
              </h2>
              <p style={{ color: '#c7d2fe', fontSize: '0.95rem', maxWidth: '640px' }}>
                {currentScene.visual_description}
              </p>
            </div>
          </div>

          {/* Interactive Narration & Clickable Words */}
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                🎙 Narration · Click glowing words to unlock revision points!
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                  onClick={handleReplayNarration}
                >
                  🔊 Replay
                </button>
                {isSpeaking && (
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.8rem', color: '#fca5a5' }}
                    onClick={handleStopSpeaking}
                  >
                    ⏹ Stop
                  </button>
                )}
              </div>
            </div>

            <p style={{ fontSize: '1.25rem', lineHeight: '1.8', color: '#f8fafc' }}>
              {renderInteractiveNarration(currentScene.narration_text)}
            </p>
          </div>

          {/* Player Navigation Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              className="btn btn-secondary"
              disabled={currentSceneIdx === 0}
              onClick={() => {
                handleStopSpeaking();
                setCurrentSceneIdx(currentSceneIdx - 1);
                speakScene(scenes[currentSceneIdx - 1]?.narration_text);
              }}
            >
              ← Previous Scene
            </button>

            <button
              className="btn btn-primary btn-lg"
              onClick={goToNextScene}
            >
              {currentSceneIdx + 1 === scenes.length ? 'Finish Lesson & Take Quiz →' : 'Next Scene →'}
            </button>
          </div>
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
          <p>Loading animated lesson scenes...</p>
        </div>
      )}

      {/* Acceptance Requirement: Resume-With-Revision Modal */}
      {showResumeModal && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ maxWidth: '640px', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🌟</div>
            <h2 style={{ fontSize: '1.8rem', marginBottom: '8px' }}>Welcome Back, Explorer!</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
              Before we continue at <strong>Scene {currentSceneIdx + 1}</strong>, refresh your memory with what you unlocked so far:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px', textAlign: 'left', maxHeight: '40vh', overflowY: 'auto' }}>
              {unlockedBullets.length === 0 ? (
                <p style={{ color: 'var(--text-dim)', textAlign: 'center' }}>No revision bullets unlocked yet. Ready to learn!</p>
              ) : (
                unlockedBullets.map((b, idx) => (
                  <div key={idx} style={{ background: 'rgba(15, 23, 42, 0.7)', border: '1px solid #10b981', padding: '14px 18px', borderRadius: 'var(--radius-sm)', display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span style={{ color: '#10b981', fontSize: '1.2rem' }}>✓</span>
                    <span style={{ fontSize: '0.95rem' }}>{b.text}</span>
                  </div>
                ))
              )}
            </div>

            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%' }}
              onClick={() => {
                setShowResumeModal(false);
                speakScene(scenes[currentSceneIdx]?.narration_text);
              }}
            >
              Ready! Continue Lesson at Scene {currentSceneIdx + 1} →
            </button>
          </div>
        </div>
      )}

      {/* Mid-Video Question Modal with 3s Anti-Rushing Lock */}
      {activeQuestion && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ maxWidth: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span className="badge badge-accent">Mid-Lesson Check</span>
              {buttonLocked && (
                <span className="badge badge-warning" style={{ background: '#f59e0b', color: '#111827' }}>
                  ⏳ Please read: Buttons unlock in {lockCountdown}s
                </span>
              )}
            </div>

            <h3 style={{ fontSize: '1.3rem', marginBottom: '20px', lineHeight: '1.5' }}>
              {activeQuestion.question_text}
            </h3>

            {hintText && (
              <div style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid #f59e0b', color: '#fde68a', padding: '12px', borderRadius: 'var(--radius-sm)', marginBottom: '16px', fontSize: '0.9rem' }}>
                💡 <strong>Hint:</strong> {hintText}
              </div>
            )}

            {explanationText && (
              <div style={{ background: 'rgba(56, 189, 248, 0.15)', border: '1px solid #38bdf8', color: '#bae6fd', padding: '12px', borderRadius: 'var(--radius-sm)', marginBottom: '16px', fontSize: '0.9rem' }}>
                📘 <strong>Explanation:</strong> {explanationText}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {activeQuestion.options.map((opt, idx) => (
                <button
                  key={idx}
                  className="btn btn-secondary"
                  disabled={buttonLocked}
                  style={{
                    justifyContent: 'flex-start',
                    padding: '16px 20px',
                    fontSize: '1rem',
                    textAlign: 'left',
                    background: selectedAnswer === opt
                      ? evaluationFeedback === 'correct'
                        ? 'rgba(16, 185, 129, 0.3)'
                        : 'rgba(239, 68, 68, 0.3)'
                      : 'rgba(15, 23, 42, 0.7)',
                    borderColor: selectedAnswer === opt
                      ? evaluationFeedback === 'correct' ? '#10b981' : '#ef4444'
                      : 'var(--border-subtle)'
                  }}
                  onClick={() => handleAnswerSubmit(opt)}
                >
                  <strong style={{ marginRight: '12px', color: 'var(--color-primary-light)' }}>
                    {String.fromCharCode(65 + idx)}.
                  </strong>
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Live Side-Panel Revision Sheet Drawer */}
      {drawerOpen && (
        <div className="modal-overlay" onClick={() => setDrawerOpen(false)}>
          <div
            className="glass-panel"
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: '400px',
              maxWidth: '90vw',
              padding: '28px',
              borderRadius: '20px 0 0 20px',
              zIndex: 150,
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3>📝 Revision Sheet</h3>
              <button className="btn btn-secondary" style={{ padding: '4px 10px' }} onClick={() => setDrawerOpen(false)}>✕</button>
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Points unlocked by clicking highlighted words during the lesson:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {unlockedBullets.length === 0 ? (
                <p style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: '40px' }}>
                  No points unlocked yet! Watch for glowing keywords in the narration and tap them.
                </p>
              ) : (
                unlockedBullets.map((b, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(15, 23, 42, 0.7)',
                      border: idx === justUnlockedIndex ? '2px solid #ec4899' : '1px solid var(--border-subtle)',
                      padding: '14px',
                      borderRadius: 'var(--radius-sm)'
                    }}
                  >
                    <span className="badge badge-science" style={{ marginBottom: '6px' }}>Takeaway {idx + 1}</span>
                    <p style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>{b.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
