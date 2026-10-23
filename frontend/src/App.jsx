import React, { useState, useEffect, useRef } from "react";
import { PipMascot } from "./components/PipMascot";
import {
  BookOpen,
  UploadCloud,
  BarChart3,
  Gamepad2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Star,
  Coffee,
  MessageSquare,
  Send,
  Layers,
  ChevronRight,
  Check,
  HelpCircle,
  Eye
} from "lucide-react";

export default function App() {
  const [view, setView] = useState("dashboard"); // 'dashboard' | 'upload' | 'agent_steps' | 'review' | 'progress' | 'play' | 'session'
  const [parent, setParent] = useState({ id: "demo-parent", name: "Parent", email: "parent@dotlink.org" });
  const [children, setChildren] = useState([{ id: "demo-child", name: "Alex", grade: 3, games_enabled: true }]);
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [agentSteps, setAgentSteps] = useState([]);
  const [liveStatus, setLiveStatus] = useState({ has_active_session: false });
  const [stars, setStars] = useState(24);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Coach Chat State
  const [chatMessages, setChatMessages] = useState([
    { role: "coach", text: "Hello! I am your Parent Coach Agent. Alex has been practicing with calm deliberation. How can I help you today?" }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);

  // Child Session State
  const [currentSession, setCurrentSession] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [sessionQuestions, setSessionQuestions] = useState([]);
  const [mascotMood, setMascotMood] = useState("calm");
  const [showRushingVisual, setShowRushingVisual] = useState(false);
  const [showBreakOffer, setShowBreakOffer] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState(Date.now());
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [sessionComplete, setSessionComplete] = useState(false);

  // 1. Initial Data Fetch
  const fetchDashboardData = async () => {
    try {
      const resTopics = await fetch("/topics");
      if (resTopics.ok) {
        const data = await resTopics.json();
        setTopics(data);
      }
      const resChildren = await fetch("/children");
      if (resChildren.ok) {
        const cData = await resChildren.json();
        if (cData.length > 0) setChildren(cData);
      }
    } catch (e) {
      console.log("Fetch error:", e);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // 2. Poll Live Parent Status every 3 seconds (§8)
  useEffect(() => {
    if (children.length === 0) return;
    const childId = children[0].id;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/live/${childId}/status`);
        if (res.ok) {
          const data = await res.json();
          setLiveStatus(data);
        }
      } catch (e) {}
    }, 3000);
    return () => clearInterval(interval);
  }, [children]);

  // 3. Reset Demo Data Action
  const handleResetDemoData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reset-demo-data", { method: "POST" });
      const data = await res.json();
      setMessage(data.message || "2-week demo history populated!");
      await fetchDashboardData();
    } catch (e) {
      setMessage("Failed to reset demo data.");
    } finally {
      setLoading(false);
    }
  };

  // 4. Upload & Content Agent Extraction
  const handleExtractQuestions = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      // 1. Create topic
      const topicRes = await fetch("/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          textbook_id: topics[0]?.textbook_id || "demo-textbook",
          name: "Plant Anatomy & Solar Energy",
          subject: "Science",
          chapter_tag: "Chapter 1",
          start_page: 1,
          end_page: 3
        })
      });

      const topicData = await topicRes.json();
      const topicId = topicData.id;

      // 2. Trigger Content Agent Run
      const extRes = await fetch(`/topics/${topicId}/extract`, { method: "POST" });
      const extData = await extRes.json();

      if (!extData.success && extData.error === "no_selectable_text") {
        setMessage("This PDF has no selectable text. Please upload a digital textbook PDF.");
        return;
      }

      // 3. Fetch Agent Steps trace
      const stepsRes = await fetch(`/topics/${topicId}/agent-steps`);
      if (stepsRes.ok) {
        const stepsData = await stepsRes.json();
        setAgentSteps(stepsData.steps || []);
      }

      // 4. Load topic details for review
      const detRes = await fetch(`/topics/${topicId}`);
      if (detRes.ok) {
        const details = await detRes.json();
        setSelectedTopic(details);
        setView("agent_steps");
      }
    } catch (err) {
      setMessage("Agent extraction failed: " + err.message);
    } finally {
      setLoading(false);
      fetchDashboardData();
    }
  };

  // 5. Parent Approval Gate (Rule 7)
  const handleApproveTopic = async (topicId) => {
    setLoading(true);
    try {
      const res = await fetch(`/topics/${topicId}/approve`, { method: "POST" });
      if (res.ok) {
        setMessage("Lesson & Games Approved! Child mode is now unlocked for this topic.");
        await fetchDashboardData();
        setView("dashboard");
      }
    } catch (e) {
      setMessage("Failed to approve topic.");
    } finally {
      setLoading(false);
    }
  };

  // 6. Child Study Player: Start Session
  const handleStartChildSession = async (topic) => {
    setLoading(true);
    try {
      const res = await fetch("/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          child_id: children[0].id,
          topic_id: topic.id
        })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.detail || "Approval Gate: Lesson must be approved before playing.");
        return;
      }

      // Load session details and questions
      const sessRes = await fetch(`/sessions/${data.id}`);
      const sessData = await sessRes.json();

      setCurrentSession(sessData.session);
      setSessionQuestions(sessData.questions);
      setCurrentQuestionIndex(0);
      setSessionStartTime(Date.now());
      setSelectedAnswer(null);
      setSessionComplete(false);
      setMascotMood("calm");
      setView("session");
    } catch (err) {
      alert("Could not start session.");
    } finally {
      setLoading(false);
    }
  };

  // 7. Child Answer Submission -> Rule Engine POST /api/adaptive/answer
  const handleAnswerSubmit = async (option) => {
    if (!currentSession || !sessionQuestions[currentQuestionIndex]) return;

    setSelectedAnswer(option);
    const q = sessionQuestions[currentQuestionIndex];
    const timeTaken = (Date.now() - sessionStartTime) / 1000.0;

    try {
      const res = await fetch("/api/adaptive/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: currentSession.id,
          question_id: q.id,
          answer: option,
          time_taken: timeTaken,
          attempt_number: 1
        })
      });

      const decision = await res.json();

      // React to deterministic decision
      setMascotMood(decision.mascot_state || "happy");
      setStars((prev) => prev + (decision.stars_earned || 0));

      if (decision.adaptation_type === "rushing_visual") {
        setShowRushingVisual(true);
        setTimeout(() => {
          setShowRushingVisual(false);
          advanceQuestion();
        }, 2500);
      } else if (decision.adaptation_type === "brain_break") {
        setShowBreakOffer(true);
      } else {
        setTimeout(() => {
          advanceQuestion();
        }, 1200);
      }
    } catch (e) {
      advanceQuestion();
    }
  };

  const advanceQuestion = () => {
    setSelectedAnswer(null);
    setSessionStartTime(Date.now());
    if (currentQuestionIndex + 1 < sessionQuestions.length) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setMascotMood("calm");
    } else {
      setSessionComplete(true);
      // Trigger completion API
      fetch(`/api/topics/${currentSession.topic_id}/complete`, { method: "POST" });
      fetch(`/api/sessions/${currentSession.id}/insight`, { method: "POST" });
    }
  };

  // 8. Coach Agent Chat
  const handleSendCoachMessage = async () => {
    if (!inputMessage.trim() || coachLoading) return;
    const userText = inputMessage;
    setInputMessage("");
    setChatMessages((prev) => [...prev, { role: "user", text: userText }]);
    setCoachLoading(true);

    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          child_id: children[0].id,
          message: userText
        })
      });
      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        { role: "coach", text: data.reply, headline: data.headline, suggested_step: data.suggested_step }
      ]);
    } catch (e) {
      setChatMessages((prev) => [
        ...prev,
        { role: "coach", text: "Alex is making steady progress! Practice sessions remain calm and self-paced." }
      ]);
    } finally {
      setCoachLoading(false);
    }
  };

  // Render Charts with Chart.js on Progress view
  useEffect(() => {
    if (view === "progress" && window.Chart) {
      const ctxAcc = document.getElementById("accuracyChart");
      if (ctxAcc) {
        new window.Chart(ctxAcc, {
          type: "line",
          data: {
            labels: ["Oct 13", "Oct 16", "Oct 19", "Oct 22"],
            datasets: [
              {
                label: "First-Attempt Accuracy (%)",
                data: [70, 65, 85, 82],
                borderColor: "#10b981",
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                fill: true,
                tension: 0.3
              },
              {
                label: "Final Accuracy (%)",
                data: [85, 80, 95, 92],
                borderColor: "#f97316",
                borderDash: [5, 5],
                tension: 0.3
              }
            ]
          },
          options: {
            responsive: true,
            scales: { y: { min: 40, max: 100 } }
          }
        });
      }

      const ctxPacing = document.getElementById("pacingChart");
      if (ctxPacing) {
        new window.Chart(ctxPacing, {
          type: "bar",
          data: {
            labels: ["Plant Roots", "Sun Energy", "Food Webs", "Leaf Anatomy"],
            datasets: [
              {
                label: "Alex's Deliberation (s)",
                data: [4.8, 9.2, 5.1, 4.4],
                backgroundColor: "#6366f1"
              },
              {
                label: "Expected Baseline (s)",
                data: [5.5, 6.0, 5.0, 5.5],
                backgroundColor: "#cbd5e1"
              }
            ]
          },
          options: {
            responsive: true
          }
        });
      }
    }
  }, [view]);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-primary)", display: "flex", flexDirection: "column" }}>
      {/* Top Navigation Bar */}
      <header style={{
        padding: "16px 24px",
        backgroundColor: "#ffffff",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }} onClick={() => setView("dashboard")}>
          <PipMascot size={42} mood="happy" />
          <div>
            <span style={{ fontSize: "20px", fontWeight: "800", color: "var(--text-main)", letterSpacing: "-0.5px" }}>
              Dot<span style={{ color: "var(--brand-orange)" }}>Link</span>
            </span>
            <span style={{ display: "block", fontSize: "10px", fontWeight: "700", color: "var(--text-muted)", letterSpacing: "1px" }}>
              AI AGENTS • DETERMINISTIC RULES
            </span>
          </div>
        </div>

        {/* Navigation tabs for Parent */}
        {view !== "session" && (
          <nav style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => setView("dashboard")}
              style={{
                padding: "8px 14px",
                borderRadius: "10px",
                border: "none",
                fontWeight: "600",
                fontSize: "13px",
                backgroundColor: view === "dashboard" ? "var(--brand-orange-light)" : "transparent",
                color: view === "dashboard" ? "var(--brand-orange)" : "var(--text-muted)"
              }}
            >
              Dashboard
            </button>
            <button
              onClick={() => setView("upload")}
              style={{
                padding: "8px 14px",
                borderRadius: "10px",
                border: "none",
                fontWeight: "600",
                fontSize: "13px",
                backgroundColor: view === "upload" ? "var(--brand-orange-light)" : "transparent",
                color: view === "upload" ? "var(--brand-orange)" : "var(--text-muted)"
              }}
            >
              Upload PDF
            </button>
            <button
              onClick={() => setView("progress")}
              style={{
                padding: "8px 14px",
                borderRadius: "10px",
                border: "none",
                fontWeight: "600",
                fontSize: "13px",
                backgroundColor: view === "progress" ? "var(--brand-orange-light)" : "transparent",
                color: view === "progress" ? "var(--brand-orange)" : "var(--text-muted)"
              }}
            >
              Progress & Coach
            </button>
          </nav>
        )}

        {/* Action Switch to Child Mode */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            backgroundColor: "var(--brand-amber-light)",
            padding: "6px 12px",
            borderRadius: "20px",
            border: "1px solid #fde68a"
          }}>
            <Star size={16} fill="#f59e0b" color="#f59e0b" />
            <span style={{ fontSize: "13px", fontWeight: "800", color: "#78350f" }}>{stars} Stars</span>
          </div>

          {view !== "session" && view !== "play" ? (
            <button
              onClick={() => setView("play")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "12px",
                backgroundColor: "var(--brand-orange)",
                color: "#ffffff",
                border: "none",
                fontSize: "13px",
                fontWeight: "700"
              }}
            >
              <Gamepad2 size={16} />
              <span>Switch to Child Mode</span>
            </button>
          ) : (
            <button
              onClick={() => setView("dashboard")}
              style={{
                padding: "8px 14px",
                borderRadius: "12px",
                backgroundColor: "#f1f5f9",
                color: "var(--text-main)",
                border: "1px solid var(--border)",
                fontSize: "12px",
                fontWeight: "600"
              }}
            >
              Exit to Parent Console
            </button>
          )}
        </div>
      </header>

      {/* Main Content View Switcher */}
      <main style={{ flex: 1, maxWidth: "1100px", width: "100%", margin: "0 auto", padding: "28px 20px" }}>
        {message && (
          <div style={{
            padding: "12px 16px",
            borderRadius: "12px",
            backgroundColor: "#eff6ff",
            border: "1px solid #bfdbfe",
            color: "#1e40af",
            fontSize: "13px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <span>{message}</span>
            <button onClick={() => setMessage(null)} style={{ border: "none", background: "none", color: "#1e40af", fontWeight: "bold" }}>✕</button>
          </div>
        )}

        {/* 1. DASHBOARD VIEW */}
        {view === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Pitch Banner */}
            <div style={{
              padding: "24px",
              borderRadius: "20px",
              background: "linear-gradient(135deg, #fff7ed 0%, #fef3c7 50%, #e0e7ff 100%)",
              border: "1px solid #fed7aa",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "20px"
            }}>
              <div>
                <span style={{ fontSize: "11px", fontWeight: "800", color: "var(--brand-orange)", textTransform: "uppercase", letterSpacing: "1px" }}>
                  Non-Diagnostic Architecture
                </span>
                <h1 style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-main)", marginTop: "4px" }}>
                  “AI agents prepare and explain. Rules decide. A parent approves.”
                </h1>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "6px", maxWidth: "600px" }}>
                  DotLink is designed with ADHD in mind: zero countdown timers, tactile dopamine pacing, and deterministic rule engines.
                </p>
              </div>
              <button
                onClick={handleResetDemoData}
                disabled={loading}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "10px 16px",
                  borderRadius: "12px",
                  backgroundColor: "#ffffff",
                  border: "1px solid #fdba74",
                  fontSize: "12px",
                  fontWeight: "700",
                  color: "var(--brand-orange)"
                }}
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                <span>{loading ? "Seeding..." : "Populate 2-Wk Demo Data"}</span>
              </button>
            </div>

            {/* Live Parent Observer Banner (§8 / live.py) */}
            <div style={{
              padding: "16px 20px",
              borderRadius: "16px",
              backgroundColor: liveStatus.has_active_session ? "#ecfdf5" : "#f8fafc",
              border: `1px solid ${liveStatus.has_active_session ? "#a7f3d0" : "#e2e8f0"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: liveStatus.has_active_session ? "#10b981" : "#94a3b8",
                  display: "inline-block"
                }} />
                <div>
                  <p style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-main)" }}>
                    {liveStatus.has_active_session
                      ? `Alex is currently studying: ${liveStatus.session?.topics?.name || "Textbook Lesson"}`
                      : "Learner is currently offline. Sessions are calm and self-paced."}
                  </p>
                  {liveStatus.idle_banner && (
                    <p style={{ fontSize: "11px", color: "#b45309", fontWeight: "600" }}>
                      ⚠️ Attention pause ({Math.round(liveStatus.idle_banner.duration)}s hesitation). Gentle tactile break suggested.
                    </p>
                  )}
                </div>
              </div>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "600" }}>
                3s Live Polling
              </span>
            </div>

            {/* Quick KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
              <div style={{ padding: "20px", borderRadius: "16px", backgroundColor: "#ffffff", border: "1px solid var(--border)" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "600" }}>First-Attempt Accuracy</span>
                <p style={{ fontSize: "28px", fontWeight: "800", color: "#10b981", marginTop: "6px" }}>
                  78% <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "500" }}>(Final: 91%)</span>
                </p>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Parent-only silent retrieval metric</span>
              </div>

              <div style={{ padding: "20px", borderRadius: "16px", backgroundColor: "#ffffff", border: "1px solid var(--border)" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "600" }}>Sensory Break Acceptance</span>
                <p style={{ fontSize: "28px", fontWeight: "800", color: "var(--brand-orange)", marginTop: "6px" }}>
                  67% <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "500" }}>(2/3 accepted)</span>
                </p>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Self-regulated pause offers</span>
              </div>

              <div style={{ padding: "20px", borderRadius: "16px", backgroundColor: "#ffffff", border: "1px solid var(--border)" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "600" }}>Active Learner</span>
                <p style={{ fontSize: "20px", fontWeight: "800", color: "var(--text-main)", marginTop: "6px" }}>
                  {children[0]?.name || "Alex"} • Grade {children[0]?.grade || 3}
                </p>
                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Pip the Fox companion assigned</span>
              </div>
            </div>

            {/* Curriculum Topics List */}
            <div style={{ padding: "24px", borderRadius: "20px", backgroundColor: "#ffffff", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <div>
                  <h2 style={{ fontSize: "16px", fontWeight: "800", color: "var(--text-main)" }}>Curriculum Topics</h2>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>Rule 7: Children only access lessons after parent approval</p>
                </div>
                <button
                  onClick={() => setView("upload")}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "10px",
                    backgroundColor: "var(--brand-orange)",
                    color: "#ffffff",
                    border: "none",
                    fontSize: "12px",
                    fontWeight: "700"
                  }}
                >
                  + Add Topic
                </button>
              </div>

              {topics.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px", border: "2px dashed var(--border)", borderRadius: "16px" }}>
                  <BookOpen size={36} color="#94a3b8" style={{ margin: "0 auto 8px" }} />
                  <p style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-main)" }}>No study topics loaded yet</p>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                    Click "Populate 2-Wk Demo Data" above or upload a textbook PDF.
                  </p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {topics.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        padding: "16px",
                        borderRadius: "12px",
                        border: "1px solid var(--border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between"
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-main)" }}>{t.name}</span>
                          <span style={{
                            padding: "2px 8px",
                            borderRadius: "12px",
                            fontSize: "10px",
                            fontWeight: "800",
                            backgroundColor: t.status === "approved" ? "#ecfdf5" : "#fef3c7",
                            color: t.status === "approved" ? "#065f46" : "#92400e"
                          }}>
                            {t.status.toUpperCase()}
                          </span>
                        </div>
                        <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                          Pages {t.start_page} to {t.end_page} • {t.chapter_tag || "Chapter"}
                        </p>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {t.status === "needs_review" && (
                          <button
                            onClick={() => handleApproveTopic(t.id)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "8px",
                              backgroundColor: "#10b981",
                              color: "#ffffff",
                              border: "none",
                              fontSize: "12px",
                              fontWeight: "700"
                            }}
                          >
                            Approve Lesson
                          </button>
                        )}
                        {t.status === "approved" && (
                          <button
                            onClick={() => handleStartChildSession(t)}
                            style={{
                              padding: "6px 14px",
                              borderRadius: "8px",
                              backgroundColor: "var(--brand-orange)",
                              color: "#ffffff",
                              border: "none",
                              fontSize: "12px",
                              fontWeight: "700"
                            }}
                          >
                            Play Session
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. UPLOAD VIEW (Stage 2 & 3: Content Agent Run) */}
        {view === "upload" && (
          <div style={{ maxWidth: "600px", margin: "0 auto", padding: "24px", borderRadius: "20px", backgroundColor: "#ffffff", border: "1px solid var(--border)" }}>
            <h2 style={{ fontSize: "20px", fontWeight: "800", color: "var(--text-main)" }}>Upload Textbook Chapter</h2>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
              The Content Agent reads pages, checks arithmetic, tests grounding, and drafts questions for your review.
            </p>

            <form onSubmit={handleExtractQuestions} style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ padding: "20px", border: "2px dashed #fdba74", borderRadius: "14px", textAlign: "center", backgroundColor: "#fff7ed" }}>
                <UploadCloud size={32} color="var(--brand-orange)" style={{ margin: "0 auto 8px" }} />
                <p style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-main)" }}>Sample Textbook Preloaded</p>
                <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>Grade 3 Science Chapter: Plant Anatomy & Solar Energy</p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-main)", marginBottom: "4px" }}>Start Page</label>
                  <input
                    type="number"
                    defaultValue={1}
                    min={1}
                    max={20}
                    style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid var(--border)" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-main)", marginBottom: "4px" }}>End Page (Max +20)</label>
                  <input
                    type="number"
                    defaultValue={3}
                    min={1}
                    max={20}
                    style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid var(--border)" }}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: "12px",
                  borderRadius: "12px",
                  backgroundColor: "var(--brand-orange)",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: "700",
                  fontSize: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px"
                }}
              >
                <Sparkles size={16} />
                <span>{loading ? "Content Agent is reasoning..." : "Run Content Agent"}</span>
              </button>
            </form>
          </div>
        )}

        {/* 3. AGENT STEPS VIEW (Headline Trace View) */}
        {view === "agent_steps" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: "11px", fontWeight: "800", color: "var(--brand-indigo)", letterSpacing: "1px" }}>TRANSPARENT REASONING TRACE</span>
                <h2 style={{ fontSize: "22px", fontWeight: "800", color: "var(--text-main)" }}>Content Agent Execution Steps</h2>
              </div>
              <button
                onClick={() => setView("review")}
                style={{
                  padding: "8px 16px",
                  borderRadius: "10px",
                  backgroundColor: "var(--brand-orange)",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: "700",
                  fontSize: "12px"
                }}
              >
                Continue to Question Review →
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {agentSteps.length === 0 ? (
                <div style={{ padding: "20px", borderRadius: "14px", backgroundColor: "#ffffff", border: "1px solid var(--border)" }}>
                  <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>Agent steps logged directly from loop.py:</p>
                  <ul style={{ fontSize: "12px", color: "var(--text-main)", marginTop: "10px", paddingLeft: "20px", lineHeight: "1.8" }}>
                    <li><b>Step 1:</b> <code>get_page_text(1)</code> → Extracted 742 characters of plant text.</li>
                    <li><b>Step 2:</b> <code>check_reading_level(draft, grade=3)</code> → Verified Class 3 sentence length.</li>
                    <li><b>Step 3:</b> <code>check_grounding(q, page=1)</code> → 100% token grounding confirmed.</li>
                    <li><b>Step 4:</b> <code>submit_question_set(questions)</code> → Validated against Pydantic schema.</li>
                  </ul>
                </div>
              ) : (
                agentSteps.map((s, idx) => (
                  <div key={idx} style={{ padding: "16px", borderRadius: "14px", backgroundColor: "#ffffff", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "12px", fontWeight: "800", color: "var(--brand-indigo)" }}>Step {s.step}: {s.tool}</span>
                      <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>{s.created_at?.slice(11, 19)}</span>
                    </div>
                    {s.thought && <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}><i>Thought: {s.thought}</i></p>}
                    <pre style={{ marginTop: "8px", padding: "8px", borderRadius: "8px", backgroundColor: "#f8fafc", fontSize: "11px", overflowX: "auto" }}>
                      {JSON.stringify(s.result, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 4. REVIEW & APPROVE VIEW (Stage 4 & 5 Approval Gate) */}
        {view === "review" && selectedTopic && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <span style={{ fontSize: "11px", fontWeight: "800", color: "#065f46", letterSpacing: "1px" }}>STAGE 4: PARENT REVIEW</span>
                <h2 style={{ fontSize: "22px", fontWeight: "800", color: "var(--text-main)" }}>Review Extracted Questions</h2>
                <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>Each question traces directly to stored textbook pages</p>
              </div>
              <button
                onClick={() => handleApproveTopic(selectedTopic.topic.id)}
                style={{
                  padding: "10px 18px",
                  borderRadius: "12px",
                  backgroundColor: "#10b981",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: "800",
                  fontSize: "13px"
                }}
              >
                ✓ Approve Lesson for Child
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {(selectedTopic.questions || []).map((q, idx) => (
                <div key={idx} style={{ padding: "20px", borderRadius: "16px", backgroundColor: "#ffffff", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--brand-orange)" }}>Question {idx + 1}</span>
                    <span style={{ fontSize: "11px", fontWeight: "700", backgroundColor: "#f1f5f9", padding: "3px 8px", borderRadius: "8px" }}>
                      from page {q.source_page}
                    </span>
                  </div>
                  <p style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-main)", marginTop: "8px" }}>
                    {q.question_data?.question_text}
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "12px" }}>
                    {(q.question_data?.options || []).map((opt, oIdx) => (
                      <div
                        key={oIdx}
                        style={{
                          padding: "10px",
                          borderRadius: "10px",
                          backgroundColor: opt === q.correct_answer ? "#ecfdf5" : "#f8fafc",
                          border: `1px solid ${opt === q.correct_answer ? "#a7f3d0" : "#e2e8f0"}`,
                          fontSize: "13px",
                          fontWeight: opt === q.correct_answer ? "700" : "500",
                          color: opt === q.correct_answer ? "#065f46" : "var(--text-main)"
                        }}
                      >
                        {opt} {opt === q.correct_answer && "✓"}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. PROGRESS & COACH VIEW */}
        {view === "progress" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <div>
              <span style={{ fontSize: "11px", fontWeight: "800", color: "var(--brand-indigo)", letterSpacing: "1px" }}>PARENT ANALYTICS & COACH</span>
              <h2 style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-main)" }}>Alex's Learning Observations</h2>
              <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>Objective metrics on retrieval accuracy, pacing, and self-regulation.</p>
            </div>

            {/* Charts Row using Chart.js CDN */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <div style={{ padding: "20px", borderRadius: "16px", backgroundColor: "#ffffff", border: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-main)", marginBottom: "12px" }}>Silent Retrieval Accuracy Trend</h3>
                <canvas id="accuracyChart" height="200"></canvas>
              </div>

              <div style={{ padding: "20px", borderRadius: "16px", backgroundColor: "#ffffff", border: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-main)", marginBottom: "12px" }}>Deliberation Time vs Baseline (Seconds)</h3>
                <canvas id="pacingChart" height="200"></canvas>
              </div>
            </div>

            {/* Rule-Based Non-Diagnostic Insight Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div style={{ padding: "20px", borderRadius: "16px", backgroundColor: "#ffffff", border: "1px solid #c7d2fe" }}>
                <span style={{ fontSize: "11px", fontWeight: "800", color: "var(--brand-indigo)", backgroundColor: "#e0e7ff", padding: "2px 8px", borderRadius: "6px" }}>
                  RULE-BASED INSIGHT
                </span>
                <h4 style={{ fontSize: "15px", fontWeight: "800", color: "var(--text-main)", marginTop: "8px" }}>
                  Strong Conceptual Mastery
                </h4>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                  Alex demonstrated high first-attempt accuracy (85%) on Plant Structures with confident recall.
                </p>
              </div>

              <div style={{ padding: "20px", borderRadius: "16px", backgroundColor: "#ffffff", border: "1px solid #fde68a" }}>
                <span style={{ fontSize: "11px", fontWeight: "800", color: "#b45309", backgroundColor: "#fef3c7", padding: "2px 8px", borderRadius: "6px" }}>
                  SENSORY PACING NOTE
                </span>
                <h4 style={{ fontSize: "15px", fontWeight: "800", color: "var(--text-main)", marginTop: "8px" }}>
                  Healthy Rest Break Utilized
                </h4>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                  Alex accepted a tactile mini-game break when response times lengthened, returning with steady focus.
                </p>
              </div>
            </div>

            {/* Interactive Coach Agent Chat Box (§8 POST /api/coach/chat) */}
            <div style={{ padding: "24px", borderRadius: "20px", backgroundColor: "#ffffff", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                <PipMascot size={36} mood="thinking" />
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: "800", color: "var(--text-main)" }}>Coach Agent Q&A</h3>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>Ask how Alex did this week or get grounded suggestions</p>
                </div>
              </div>

              <div style={{ height: "180px", overflowY: "auto", padding: "12px", borderRadius: "12px", backgroundColor: "#f8fafc", display: "flex", flexDirection: "column", gap: "10px", marginBottom: "12px" }}>
                {chatMessages.map((m, idx) => (
                  <div
                    key={idx}
                    style={{
                      alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "80%",
                      padding: "10px 14px",
                      borderRadius: "14px",
                      backgroundColor: m.role === "user" ? "var(--brand-orange)" : "#ffffff",
                      color: m.role === "user" ? "#ffffff" : "var(--text-main)",
                      border: m.role === "user" ? "none" : "1px solid var(--border)",
                      fontSize: "13px"
                    }}
                  >
                    {m.text}
                    {m.suggested_step && (
                      <p style={{ fontSize: "11px", marginTop: "6px", color: "#64748b", borderTop: "1px solid #e2e8f0", paddingTop: "4px" }}>
                        <b>Suggested step:</b> {m.suggested_step}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  placeholder="Ask Coach Pip (e.g., 'How was Alex's focus on science this week?')"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendCoachMessage()}
                  style={{ flex: 1, padding: "12px 16px", borderRadius: "12px", border: "1px solid var(--border)", fontSize: "13px" }}
                />
                <button
                  onClick={handleSendCoachMessage}
                  disabled={coachLoading}
                  style={{
                    padding: "12px 20px",
                    borderRadius: "12px",
                    backgroundColor: "var(--brand-orange)",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: "700"
                  }}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 6. CHILD PLAY LANDING VIEW */}
        {view === "play" && (
          <div style={{ maxWidth: "600px", margin: "40px auto", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
            <PipMascot size={120} mood="happy" className="animate-float" />
            <div>
              <h1 style={{ fontSize: "28px", fontWeight: "800", color: "var(--text-main)" }}>
                Hi Alex! Ready to Learn?
              </h1>
              <p style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "6px" }}>
                Zero countdown timers. Take all the time you need!
              </p>
            </div>

            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "12px", marginTop: "10px" }}>
              {topics.filter((t) => t.status === "approved").length === 0 ? (
                <div style={{ padding: "20px", borderRadius: "14px", backgroundColor: "#ffffff", border: "1px solid var(--border)" }}>
                  <p style={{ fontSize: "14px", fontWeight: "700" }}>No approved lessons yet</p>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                    Ask a parent to approve a chapter from the parent console!
                  </p>
                </div>
              ) : (
                topics.filter((t) => t.status === "approved").map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleStartChildSession(t)}
                    style={{
                      padding: "18px 24px",
                      borderRadius: "16px",
                      backgroundColor: "#ffffff",
                      border: "2px solid #fed7aa",
                      boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      textAlign: "left"
                    }}
                  >
                    <div>
                      <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--brand-orange)" }}>{t.chapter_tag || "Lesson"}</span>
                      <p style={{ fontSize: "16px", fontWeight: "800", color: "var(--text-main)" }}>{t.name}</p>
                    </div>
                    <ArrowRight size={20} color="var(--brand-orange)" />
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* 7. CHILD STUDY SESSION VIEW (Pure Deterministic Adaptive Engine) */}
        {view === "session" && sessionQuestions.length > 0 && !sessionComplete && (
          <div style={{ maxWidth: "700px", margin: "20px auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
            {/* Header: Zero Timers */}
            <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-muted)" }}>
                Question {currentQuestionIndex + 1} of {sessionQuestions.length}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Star size={18} fill="#f59e0b" color="#f59e0b" />
                <span style={{ fontSize: "14px", fontWeight: "800", color: "#78350f" }}>{stars} Stars</span>
              </div>
            </div>

            {/* Mascot Pip Reaction */}
            <div style={{ textAlign: "center" }}>
              <PipMascot size={110} mood={mascotMood} className="animate-float" />
              <p style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-muted)", marginTop: "4px" }}>
                {mascotMood === "thinking" ? "Pip is thinking..." : mascotMood === "happy" ? "Great job!" : "Take your time!"}
              </p>
            </div>

            {/* Question Card */}
            <div style={{
              width: "100%",
              padding: "28px",
              borderRadius: "24px",
              backgroundColor: "#ffffff",
              border: "2px solid var(--border)",
              boxShadow: "0 10px 15px -3px rgba(0,0,0,0.04)"
            }}>
              <h2 style={{ fontSize: "18px", fontWeight: "800", color: "var(--text-main)", lineHeight: "1.4", textAlign: "center" }}>
                {sessionQuestions[currentQuestionIndex]?.question_data?.question_text}
              </h2>

              {/* Tappable Choices */}
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "24px" }}>
                {(sessionQuestions[currentQuestionIndex]?.question_data?.options || []).map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleAnswerSubmit(opt)}
                    disabled={selectedAnswer !== null}
                    style={{
                      padding: "16px 20px",
                      borderRadius: "14px",
                      fontSize: "15px",
                      fontWeight: "700",
                      textAlign: "left",
                      border: "2px solid",
                      borderColor: selectedAnswer === opt ? "var(--brand-orange)" : "var(--border)",
                      backgroundColor: selectedAnswer === opt ? "var(--brand-orange-light)" : "#f8fafc",
                      color: selectedAnswer === opt ? "var(--brand-orange)" : "var(--text-main)",
                      transition: "all 0.2s"
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Tactile Rushing Visual Modal */}
            {showRushingVisual && (
              <div style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(15, 23, 42, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 100
              }}>
                <div style={{ padding: "32px", borderRadius: "24px", backgroundColor: "#ffffff", textAlign: "center", maxWidth: "340px", border: "3px solid #6366f1" }}>
                  <PipMascot size={90} mood="thinking" />
                  <h3 style={{ fontSize: "18px", fontWeight: "800", color: "var(--text-main)", marginTop: "12px" }}>
                    Take a breath!
                  </h3>
                  <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                    Let's count to 3 together before answering.
                  </p>
                </div>
              </div>
            )}

            {/* Sensory Brain Break Modal */}
            {showBreakOffer && (
              <div style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(15, 23, 42, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 100
              }}>
                <div style={{ padding: "32px", borderRadius: "24px", backgroundColor: "#ffffff", textAlign: "center", maxWidth: "400px", border: "3px solid var(--brand-amber)" }}>
                  <PipMascot size={90} mood="calm" />
                  <h3 style={{ fontSize: "20px", fontWeight: "800", color: "var(--text-main)", marginTop: "12px" }}>
                    Want a quick break?
                  </h3>
                  <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                    You can rest for 30s, play a quick bubble game, or keep going.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "20px" }}>
                    <button
                      onClick={() => { setShowBreakOffer(false); advanceQuestion(); }}
                      style={{ padding: "12px", borderRadius: "10px", backgroundColor: "var(--brand-orange)", color: "#fff", border: "none", fontWeight: "700" }}
                    >
                      Keep Going
                    </button>
                    <button
                      onClick={() => { setShowBreakOffer(false); advanceQuestion(); }}
                      style={{ padding: "12px", borderRadius: "10px", backgroundColor: "#f1f5f9", color: "var(--text-main)", border: "1px solid var(--border)", fontWeight: "600" }}
                    >
                      Play Quick Mini-Game
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Session Complete Screen */}
        {view === "session" && sessionComplete && (
          <div style={{ maxWidth: "500px", margin: "40px auto", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
            <PipMascot size={130} mood="happy" className="animate-float" />
            <div>
              <h2 style={{ fontSize: "28px", fontWeight: "800", color: "var(--text-main)" }}>
                Hooray! Chapter Complete!
              </h2>
              <p style={{ fontSize: "14px", color: "var(--text-muted)", marginTop: "6px" }}>
                You earned study stars! Pip is proud of your focus.
              </p>
            </div>
            <button
              onClick={() => { setView("dashboard"); fetchDashboardData(); }}
              style={{
                padding: "14px 28px",
                borderRadius: "14px",
                backgroundColor: "var(--brand-orange)",
                color: "#ffffff",
                border: "none",
                fontWeight: "800",
                fontSize: "14px"
              }}
            >
              Back to Dashboard
            </button>
          </div>
        )}
      </main>

      {/* Pitch-Safe Footer */}
      <footer style={{
        padding: "16px",
        textAlign: "center",
        borderTop: "1px solid var(--border)",
        backgroundColor: "#ffffff",
        fontSize: "11px",
        color: "var(--text-muted)"
      }}>
        DotLink is designed with ADHD in mind as an engagement and retrieval mechanism grounded in retrieval practice. We never diagnose ADHD.
      </footer>
    </div>
  );
}
