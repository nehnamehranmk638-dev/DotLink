import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import AnimatedStage from './AnimatedStage';
import { sound } from '../../utils/soundEffects';

export default function AnimatedLessonPlayer() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // Session & Bundle State
  const [session, setSession] = useState(null);
  const [activeChild, setActiveChild] = useState(api.getActiveChild());
  const [scenes, setScenes] = useState([]);
  const [currentSceneIdx, setCurrentSceneIdx] = useState(0);
  const [highlightedWords, setHighlightedWords] = useState([]);
  const [revisionBullets, setRevisionBullets] = useState([]);
  const [unlockedBullets, setUnlockedBullets] = useState([]);
  const [inVideoQuestions, setInVideoQuestions] = useState([]);
  const [activeQuestion, setActiveQuestion] = useState(null);

  // Resume Modal State (Acceptance Check: Shows unlocked bullets FIRST on resume)
  const [showResumeModal, setShowResumeModal] = useState(false);

  // Audio / SpeechSynthesis State & Word-by-Word Karaoke Tracking
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [speechRate, setSpeechRate] = useState(0.95);
  const [currentSpokenWordIdx, setCurrentSpokenWordIdx] = useState(-1);
  const [isMuted, setIsMuted] = useState(false);
  const fallbackIntervalRef = useRef(null);

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
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
    }
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
      setActiveChild(activeKid);

      // Fetch session from db via router directly without redundant pre-call
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

  // Speak Narration using Web SpeechSynthesis API with karaoke word-by-word tracking
  const speakScene = (text, rateOverride = null) => {
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }

    if (!text || !('speechSynthesis' in window)) {
      setSpeechSupported(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const activeRate = rateOverride || speechRate;
    utterance.rate = activeRate;
    utterance.pitch = 1.08; // Cheerful, warm kid-friendly pitch

    const words = text.split(/\s+/).filter(Boolean);

    utterance.onstart = () => {
      setIsSpeaking(true);
      setCurrentSpokenWordIdx(0);

      // Fallback interval in case browser omits onboundary events
      let currentIdx = 0;
      const intervalMs = Math.max(160, Math.round(290 / activeRate));
      fallbackIntervalRef.current = setInterval(() => {
        currentIdx++;
        if (currentIdx < words.length) {
          setCurrentSpokenWordIdx(currentIdx);
        } else {
          clearInterval(fallbackIntervalRef.current);
          fallbackIntervalRef.current = null;
        }
      }, intervalMs);
    };

    utterance.onboundary = (e) => {
      if (e.name === 'word' || e.charIndex !== undefined) {
        let charCount = 0;
        for (let i = 0; i < words.length; i++) {
          charCount += words[i].length + 1;
          if (charCount > e.charIndex) {
            setCurrentSpokenWordIdx(i);
            break;
          }
        }
      }
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setCurrentSpokenWordIdx(-1);
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
      setCurrentSpokenWordIdx(-1);
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
    };

    window.speechSynthesis.speak(utterance);
  };

  const handleStopSpeaking = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
    setIsSpeaking(false);
    setCurrentSpokenWordIdx(-1);
  };

  const handleReplayNarration = () => {
    sound.playPop();
    const scene = scenes[currentSceneIdx];
    if (scene) speakScene(scene.narration_text);
  };

  const handleRateChange = (newRate) => {
    setSpeechRate(newRate);
    sound.playPop();
    if (isSpeaking) {
      const scene = scenes[currentSceneIdx];
      if (scene) speakScene(scene.narration_text, newRate);
    }
  };

  // Check 1: Click Highlighted Word
  const handleWordClick = async (wordObj) => {
    sound.playPop();
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
        // Play triumphant fanfare upon unlocking revision bullet
        sound.playSuccess();
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
    sound.playChime();
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
      sound.playSuccess();
      navigate(`/play/quiz/${sessionId}`);
    }
  };

  const handlePauseAndExit = async () => {
    handleStopSpeaking();
    sound.playPop();
    const token = localStorage.getItem('dotlink_token');
    await fetch(`http://localhost:8000/sessions/${sessionId}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scene_index: currentSceneIdx })
    }).catch(() => {});
    navigate('/play');
  };

  const currentScene = scenes[currentSceneIdx];

  // Tokenized Karaoke & Clickable Word Replacement
  const renderInteractiveNarration = (text) => {
    if (!text) return null;
    const words = text.split(/\s+/).filter(Boolean);

    // Build map for highlighted concept keywords
    const highlightLookup = new Map();
    (highlightedWords || []).forEach((hw) => {
      highlightLookup.set(hw.word.toLowerCase(), hw);
    });

    return words.map((w, idx) => {
      // Clean word for concept lookup
      const cleanWord = w.replace(/^[^\w]+|[^\w]+$/g, '').toLowerCase();
      const hw = highlightLookup.get(cleanWord);
      const isCurrentlySpoken = isSpeaking && idx === currentSpokenWordIdx;

      if (hw) {
        return (
          <span
            key={`word-${idx}`}
            className="pulsing-word"
            style={{
              margin: '0 4px',
              border: isCurrentlySpoken ? '2px solid #fef08a' : undefined,
              boxShadow: isCurrentlySpoken ? '0 0 18px #fbbf24' : undefined,
              transform: isCurrentlySpoken ? 'scale(1.15)' : undefined
            }}
            title={`Key Concept: ${hw.key_point}. Click to add to your Revision Sheet!`}
            onClick={(e) => {
              e.stopPropagation();
              handleWordClick(hw);
            }}
          >
            ✨ {w}{' '}
          </span>
        );
      }

      if (isCurrentlySpoken) {
        return (
          <span key={`word-${idx}`} className="karaoke-current-word">
            {w}{' '}
          </span>
        );
      }

      return <span key={`word-${idx}`}>{w} </span>;
    });
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px', position: 'relative' }}>
      {/* Top Session Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="btn btn-secondary" onClick={handlePauseAndExit}>
            ⏸ Pause & Save Lesson
          </button>
          <button
            className="btn btn-secondary"
            style={{ padding: '8px 14px', fontSize: '0.9rem' }}
            onClick={() => {
              const muted = sound.toggleMute();
              setIsMuted(muted);
            }}
            title={isMuted ? 'Sound FX Muted - Tap to Unmute' : 'Sound FX Active - Tap to Mute'}
          >
            {isMuted ? '🔇 Sound Muted' : '🔊 Sound FX On'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '0.95rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            Scene {currentSceneIdx + 1} of {scenes.length || 4}
          </span>
          <button
            className="btn btn-primary"
            style={{ padding: '8px 18px', position: 'relative' }}
            onClick={() => {
              sound.playPop();
              setDrawerOpen(true);
            }}
          >
            📋 Revision Sheet ({unlockedBullets.length}/{revisionBullets.length})
            {justUnlockedIndex !== null && (
              <span style={{ position: 'absolute', top: '-6px', right: '-6px', width: '14px', height: '14px', borderRadius: '50%', background: '#ec4899', border: '2px solid white', animation: 'ping 1.2s infinite' }} />
            )}
          </button>
        </div>
      </div>

      {/* Main Animated Scene Card */}
      {currentScene ? (
        <div className="glass-panel-elevated" style={{ padding: '28px', minHeight: '520px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {/* Dynamic Anime.js Animated Educational Stage */}
          <AnimatedStage
            scene={currentScene}
            sceneIndex={currentSceneIdx}
            totalScenes={scenes.length}
            mascotName={session?.mascot_name || activeChild?.mascot_name || 'Luna the Owl'}
            isSpeaking={isSpeaking}
            subjectTag={session?.subject_tag || 'Maths'}
            onInteraction={() => {
              lastInteractionRef.current = Date.now();
            }}
          />

          {/* Interactive Narration & Voice Controls */}
          <div style={{ background: 'rgba(15, 23, 42, 0.75)', padding: '24px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(165, 180, 252, 0.2)', marginBottom: '24px', boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  🎙 Companion Voice Narration
                </span>
                <span style={{ fontSize: '0.78rem', color: '#c7d2fe', background: 'rgba(99, 102, 241, 0.2)', padding: '2px 8px', borderRadius: '6px' }}>
                  Click glowing words to unlock stars! ⭐
                </span>
              </div>

              {/* Voice Speed & Playback Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', background: 'rgba(30, 41, 59, 0.8)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border-subtle)' }}>
                  {[
                    { label: '0.85x', rate: 0.85 },
                    { label: '1.0x', rate: 0.95 },
                    { label: '1.2x', rate: 1.15 }
                  ].map((spd) => (
                    <button
                      key={spd.label}
                      type="button"
                      onClick={() => handleRateChange(spd.rate)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: Math.abs(speechRate - spd.rate) < 0.05 ? 'var(--color-primary)' : 'transparent',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      {spd.label}
                    </button>
                  ))}
                </div>

                <button
                  className="btn btn-secondary"
                  style={{ padding: '6px 14px', fontSize: '0.85rem', fontWeight: 700 }}
                  onClick={handleReplayNarration}
                >
                  🔊 Listen
                </button>
                {isSpeaking && (
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '6px 14px', fontSize: '0.85rem', color: '#fca5a5', fontWeight: 700 }}
                    onClick={handleStopSpeaking}
                  >
                    ⏹ Pause Voice
                  </button>
                )}
              </div>
            </div>

            {/* Karaoke Highlighted Narration Text */}
            <p style={{ fontSize: '1.28rem', lineHeight: '2.1', color: '#f8fafc', fontWeight: 500 }}>
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
                sound.playPop();
                sound.playChime();
                setCurrentSceneIdx(currentSceneIdx - 1);
                speakScene(scenes[currentSceneIdx - 1]?.narration_text);
              }}
            >
              ← Previous Scene
            </button>

            <button
              className="btn btn-primary btn-lg"
              style={{ padding: '14px 32px', fontSize: '1.1rem', fontWeight: 800 }}
              onClick={() => {
                sound.playPop();
                goToNextScene();
              }}
            >
              {currentSceneIdx + 1 === scenes.length ? 'Finish Lesson & Take Quiz 🚀' : 'Next Scene →'}
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
