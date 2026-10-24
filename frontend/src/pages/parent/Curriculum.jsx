import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { animate, createTimeline } from 'animejs';
import { api } from '../../api';

const AVAILABLE_TAGS = [
  'Maths',
  'Science',
  'History',
  'Geography',
  'English',
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

  // Upload & Tag State
  const [pdfFile, setPdfFile] = useState(null);
  const [tag, setTag] = useState('Maths');
  const [grade, setGrade] = useState(4);
  const [showTagUI, setShowTagUI] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Chapter Accordion State
  const [expandedChapters, setExpandedChapters] = useState({ 1: true });

  // Agent Steps Trace Modal
  const [selectedTopicSteps, setSelectedTopicSteps] = useState(null);
  const [traceLogs, setTraceLogs] = useState([]);

  const fileInputRef = useRef(null);

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
      setChildren(kids || []);
      if (kids && kids.length > 0 && !activeChild) {
        api.setActiveChild(kids[0]);
        setActiveChild(kids[0]);
        setGrade(kids[0].grade || 4);
      }
      const tbs = await api.getTextbooks();
      setTextbooks(tbs || []);

      if (tbs && tbs.length > 0) {
        const toSelect = targetTextbookId
          ? tbs.find((b) => b.id === targetTextbookId) || tbs[0]
          : selectedTextbook
          ? tbs.find((b) => b.id === selectedTextbook.id) || tbs[0]
          : tbs[0];

        setSelectedTextbook(toSelect);
        const topList = await api.getTopics(toSelect.id);
        setTopics(topList || []);
      }
    } catch (err) {
      console.error('Error loading curriculum data:', err);
    }
  };

  const handleSelectTextbook = async (tb) => {
    setSelectedTextbook(tb);
    try {
      const topList = await api.getTopics(tb.id);
      setTopics(topList || []);
      setExpandedChapters({ 1: true });
    } catch (err) {
      console.error(err);
    }
  };

  // Play Upload Animation upon File Selection
  const triggerUploadAnimation = (file) => {
    if (isAnimating) return;
    setIsAnimating(true);
    setPdfFile(file);
    setErrorMessage('');

    // Reset anime element values
    animate('.ring-fill', { strokeDashoffset: 226, duration: 0 });
    animate('.icon-check', { opacity: 0, scale: 0, duration: 0 });
    animate('.icon-arrow', { opacity: 1, scale: 1, translateY: 0, duration: 0 });
    animate('.moving-file', { translateX: 0, translateY: 0, scale: 1, opacity: 0, duration: 0 });

    const tl = createTimeline({
      ease: 'outExpo',
      onComplete: () => {
        setIsAnimating(false);
        // Switch from Upload UI to Tag Selection UI
        animate('#upload-action-ui', {
          opacity: 0,
          duration: 250,
          ease: 'linear',
          onComplete: () => {
            setShowTagUI(true);
            setTimeout(() => {
              animate('#tag-ui', {
                opacity: [0, 1],
                translateY: [15, 0],
                duration: 400,
                ease: 'outBack'
              });
            }, 50);
          }
        });
      }
    });

    tl
      .add('.icon-arrow', {
        translateY: 10,
        duration: 300,
        ease: 'inQuad'
      })
      .add('.moving-file', {
        opacity: [0, 1],
        translateX: -120,
        translateY: -5,
        duration: 600,
        ease: 'outQuart'
      }, '-=100')
      .add('.icon-arrow', {
        scale: 0,
        opacity: 0,
        duration: 300
      }, '-=400')
      .add('.ring-fill', {
        strokeDashoffset: [226, 0],
        duration: 1000,
        ease: 'inOutSine'
      })
      .add('.moving-file', {
        opacity: 0,
        scale: 0,
        duration: 300
      }, '-=200')
      .add('.icon-check', {
        opacity: 1,
        scale: [0, 1],
        duration: 500,
        ease: 'outBack'
      }, '-=100');
  };

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setErrorMessage('Please choose a valid PDF textbook document.');
        return;
      }
      triggerUploadAnimation(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setErrorMessage('Please choose a valid PDF textbook document.');
        return;
      }
      triggerUploadAnimation(file);
    }
  };

  const handleSaveTagAndProcess = async () => {
    if (!tag.trim()) {
      setErrorMessage('Please select or type a subject tag!');
      return;
    }
    if (!pdfFile) {
      setErrorMessage('No PDF file selected.');
      return;
    }

    setLoadingAction(true);
    setStatusMessage('Agent 1: Extracting digital pages and chunking into Chapters & Sub-Topics...');
    setErrorMessage('');

    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      formData.append('subject_tag', tag.trim());
      formData.append('grade', grade || activeChild?.grade || 4);

      const res = await api.uploadAndChunkTextbook(formData);
      const chCount = res.chapters ? res.chapters.length : 1;
      const topCount = res.topics ? res.topics.length : 0;
      setStatusMessage(`Success! Organized "${res.title}" into ${chCount} Chapter(s) and ${topCount} Sub-Topics.`);

      // Reset upload card for subsequent uploads
      resetUploadCard();

      // Reload textbooks and auto-select new textbook
      await loadData(res.textbook_id);
    } catch (err) {
      setErrorMessage(err.message || 'Textbook processing failed.');
    } finally {
      setLoadingAction(false);
    }
  };

  const resetUploadCard = () => {
    setShowTagUI(false);
    setPdfFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    const actionUI = document.getElementById('upload-action-ui');
    if (actionUI) {
      actionUI.style.display = 'block';
      actionUI.style.opacity = '1';
    }
    animate('.ring-fill', { strokeDashoffset: 226, duration: 0 });
    animate('.icon-check', { opacity: 0, scale: 0, duration: 0 });
    animate('.icon-arrow', { opacity: 1, scale: 1, translateY: 0, duration: 0 });
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

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#a8be8f', // Sage / olive green from user template
        fontFamily: "'Baloo 2', 'Segoe UI', sans-serif",
        padding: '32px 20px',
        color: '#3b2a49'
      }}
    >
      {/* Top Header & Navigation */}
      <div
        style={{
          maxWidth: '1000px',
          margin: '0 auto 28px auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            backgroundColor: '#ffffff',
            border: '3px solid #cca9ef',
            borderRadius: '9999px',
            padding: '10px 22px',
            color: '#3b2a49',
            fontWeight: 800,
            fontSize: '16px',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          ← Parent Hub
        </button>

        {activeChild && (
          <div
            style={{
              backgroundColor: '#ffffff',
              border: '3px solid #cca9ef',
              borderRadius: '9999px',
              padding: '8px 20px',
              fontWeight: 700,
              color: '#3b2a49',
              fontSize: '15px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <span>🎒 Active Learner:</span>
            <span style={{ color: '#6a9a73', fontWeight: 800 }}>{activeChild.name}</span>
            <span style={{ color: '#6b7280', fontSize: '14px' }}>(Grade {activeChild.grade})</span>
          </div>
        )}
      </div>

      {/* Main Container */}
      <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>

        {/* Status Alerts */}
        {statusMessage && (
          <div
            style={{
              backgroundColor: '#d1fae5',
              border: '3px solid #6ee7b7',
              color: '#065f46',
              padding: '14px 20px',
              borderRadius: '20px',
              fontWeight: 700,
              fontSize: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
            }}
          >
            ✓ {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div
            style={{
              backgroundColor: '#ffe4e6',
              border: '3px solid #fecdd3',
              color: '#9f1239',
              padding: '14px 20px',
              borderRadius: '20px',
              fontWeight: 700,
              fontSize: '16px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
            }}
          >
            ⚠ {errorMessage}
          </div>
        )}

        {/* ==============================================================
           UPLOAD CARD WITH CIRCULAR PROGRESS RING & TAG PICKER (Template 3)
           ============================================================== */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div
            className="upload-card"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            style={{
              background: '#ffffff',
              width: '100%',
              maxWidth: '480px',
              padding: '44px 36px',
              border: '8px solid #cca9ef',
              borderRadius: '28px',
              boxShadow: isDragging ? '0 15px 30px rgba(106, 154, 115, 0.35)' : '0 10px 24px rgba(0, 0, 0, 0.1)',
              textAlign: 'center',
              minHeight: '290px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              boxSizing: 'border-box',
              position: 'relative',
              transition: 'box-shadow 0.2s'
            }}
          >
            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />

            {/* Animation Area isolates the moving parts */}
            <div
              className="animation-area"
              style={{
                position: 'relative',
                width: '80px',
                height: '80px',
                margin: '0 auto 30px auto'
              }}
            >
              <svg
                className="progress-ring"
                width="80"
                height="80"
                style={{ transform: 'rotate(-90deg)', position: 'absolute', top: 0, left: 0 }}
              >
                <circle cx="40" cy="40" r="36" fill="transparent" stroke="#f0f0f0" strokeWidth="6" />
                <circle
                  className="ring-fill"
                  cx="40"
                  cy="40"
                  r="36"
                  fill="transparent"
                  stroke="#cca9ef"
                  strokeWidth="6"
                  strokeDasharray="226"
                  strokeDashoffset="226"
                  strokeLinecap="round"
                />
              </svg>

              <div
                className="icons"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center'
                }}
              >
                <svg
                  className="icon-arrow"
                  viewBox="0 0 24 24"
                  style={{ width: '26px', height: '26px', fill: '#cca9ef' }}
                >
                  <path d="M12 4l-8 8h6v8h4v-8h6z" />
                </svg>
                <svg
                  className="icon-check"
                  viewBox="0 0 24 24"
                  style={{
                    width: '36px',
                    height: '36px',
                    fill: '#6a9a73',
                    opacity: 0,
                    transform: 'scale(0)',
                    position: 'absolute'
                  }}
                >
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              </div>

              {/* Moving File Badge */}
              <div
                className="moving-file"
                style={{
                  position: 'absolute',
                  width: '34px',
                  height: '42px',
                  background: '#ffffff',
                  border: '2px solid #cca9ef',
                  borderRadius: '6px',
                  right: '-100px',
                  top: '19px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#3b2a49',
                  opacity: 0,
                  boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
                  zIndex: 10
                }}
              >
                PDF
              </div>
            </div>

            {/* Initial Upload UI */}
            {!showTagUI && (
              <div id="upload-action-ui">
                <div style={{ color: '#3b2a49', fontSize: '19px', fontWeight: 700, marginBottom: '22px' }}>
                  {isDragging ? 'Drop PDF textbook right here!' : 'Drag files to upload, or'}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  disabled={isAnimating}
                  style={{
                    background: '#6a9a73',
                    color: 'white',
                    border: 'none',
                    padding: '14px 36px',
                    borderRadius: '30px',
                    fontSize: '17px',
                    fontWeight: 700,
                    cursor: isAnimating ? 'wait' : 'pointer',
                    outline: 'none',
                    boxShadow: '0 5px 0 #4f7757',
                    transition: 'background 0.2s, transform 0.1s'
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.transform = 'translateY(4px)';
                    e.currentTarget.style.boxShadow = '0 1px 0 #4f7757';
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 5px 0 #4f7757';
                  }}
                >
                  {isAnimating ? 'Uploading...' : 'Choose File'}
                </button>
              </div>
            )}

            {/* Tag Selection UI (Appears after upload animation completes) */}
            {showTagUI && (
              <div id="tag-ui" style={{ opacity: 1 }}>
                <div style={{ color: '#3b2a49', fontSize: '20px', fontWeight: 800, marginBottom: '10px' }}>
                  Upload Complete! Add a tag:
                </div>

                {pdfFile && (
                  <div
                    style={{
                      display: 'inline-block',
                      backgroundColor: '#f3e8ff',
                      color: '#4a315d',
                      padding: '4px 14px',
                      borderRadius: '9999px',
                      fontSize: '13px',
                      fontWeight: 700,
                      marginBottom: '16px',
                      maxWidth: '85%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    📄 {pdfFile.name}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="text"
                    value={tag}
                    onChange={(e) => setTag(e.target.value)}
                    list="tag-options"
                    placeholder="Type or pick a tag..."
                    style={{
                      width: '88%',
                      padding: '12px 18px',
                      border: '2px solid #cca9ef',
                      borderRadius: '14px',
                      fontSize: '16px',
                      fontFamily: 'inherit',
                      fontWeight: 700,
                      outline: 'none',
                      color: '#3b2a49',
                      backgroundColor: '#faf5ff'
                    }}
                  />
                  <datalist id="tag-options">
                    {AVAILABLE_TAGS.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>

                  {/* Grade Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#6b7280' }}>Grade:</span>
                    <select
                      value={grade}
                      onChange={(e) => setGrade(Number(e.target.value))}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '10px',
                        border: '2px solid #cca9ef',
                        fontWeight: 700,
                        color: '#3b2a49',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
                        <option key={g} value={g}>Grade {g}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '22px' }}>
                  <button
                    type="button"
                    onClick={handleSaveTagAndProcess}
                    disabled={loadingAction}
                    style={{
                      background: '#6a9a73',
                      color: 'white',
                      border: 'none',
                      padding: '12px 36px',
                      borderRadius: '30px',
                      fontSize: '17px',
                      fontWeight: 800,
                      cursor: loadingAction ? 'wait' : 'pointer',
                      outline: 'none',
                      boxShadow: '0 5px 0 #4f7757',
                      transition: 'background 0.2s, transform 0.1s'
                    }}
                    onMouseDown={(e) => {
                      e.currentTarget.style.transform = 'translateY(4px)';
                      e.currentTarget.style.boxShadow = '0 1px 0 #4f7757';
                    }}
                    onMouseUp={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 5px 0 #4f7757';
                    }}
                  >
                    {loadingAction ? 'Processing Textbook...' : 'Done'}
                  </button>

                  <button
                    type="button"
                    onClick={resetUploadCard}
                    disabled={loadingAction}
                    style={{
                      background: '#f3f4f6',
                      color: '#4b5563',
                      border: '2px solid #e5e7eb',
                      padding: '12px 20px',
                      borderRadius: '30px',
                      fontSize: '15px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ==============================================================
           TEXTBOOK & CHUNKED CHAPTERS BROWSER
           ============================================================== */}
        {textbooks.length > 0 && (
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '28px',
              padding: '32px',
              border: '6px solid #cca9ef',
              boxShadow: '0 10px 20px rgba(0, 0, 0, 0.08)'
            }}
          >
            {/* Textbook Tabs Header */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <h2 style={{ fontSize: '24px', fontWeight: 800, margin: 0, color: '#3b2a49' }}>
                  📚 Uploaded Textbooks
                </h2>
                <span style={{ fontSize: '15px', fontWeight: 700, color: '#6b7280' }}>
                  Select a book to inspect chapters & sub-topics
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {textbooks.map((tb) => {
                  const isSelected = selectedTextbook?.id === tb.id;
                  return (
                    <button
                      key={tb.id}
                      onClick={() => handleSelectTextbook(tb)}
                      style={{
                        padding: '10px 20px',
                        borderRadius: '16px',
                        fontWeight: 700,
                        fontSize: '15px',
                        cursor: 'pointer',
                        border: isSelected ? '3px solid #6a9a73' : '2px solid #e5e7eb',
                        backgroundColor: isSelected ? '#ecfdf5' : '#f9fafb',
                        color: isSelected ? '#065f46' : '#374151',
                        boxShadow: isSelected ? '0 4px 10px rgba(106, 154, 115, 0.2)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {tb.title} · <span style={{ opacity: 0.8 }}>Grade {tb.grade}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Chapters & Topics List */}
            {selectedTextbook && (
              <div>
                <div style={{ borderTop: '2px dashed #cca9ef', paddingTop: '20px', marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px 0', color: '#4a315d' }}>
                    {selectedTextbook.title}
                  </h3>
                  <p style={{ color: '#6b7280', fontSize: '14px', fontWeight: 600, margin: 0 }}>
                    Subject: {selectedTextbook.subject} · Grade: {selectedTextbook.grade} · {topics.length} Sub-Topics Extracted
                  </p>
                </div>

                {chaptersList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '36px', color: '#6b7280', fontWeight: 600 }}>
                    No topics found for this textbook.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {chaptersList.map((ch) => {
                      const isExpanded = expandedChapters[ch.chapter_number];
                      return (
                        <div
                          key={ch.chapter_number}
                          style={{
                            border: '2px solid #e5e7eb',
                            borderRadius: '18px',
                            overflow: 'hidden',
                            backgroundColor: '#faf5ff'
                          }}
                        >
                          {/* Chapter Header */}
                          <button
                            type="button"
                            onClick={() => toggleChapter(ch.chapter_number)}
                            style={{
                              width: '100%',
                              padding: '16px 20px',
                              backgroundColor: '#f3e8ff',
                              border: 'none',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              cursor: 'pointer',
                              textAlign: 'left'
                            }}
                          >
                            <div>
                              <span style={{ fontWeight: 800, fontSize: '18px', color: '#4a315d' }}>
                                Chapter {ch.chapter_number}: {(ch.chapter_title || '').replace(/^Chapter\s*\d+[:\s\-]*/i, '')}
                              </span>
                              <span style={{ marginLeft: '12px', fontSize: '13px', fontWeight: 700, color: '#7c3aed' }}>
                                Pages {ch.min_page} to {ch.max_page} · ({ch.topics.length} sub-topics)
                              </span>
                            </div>
                            <span style={{ fontSize: '18px', fontWeight: 800, color: '#6d28d9' }}>
                              {isExpanded ? '▲' : '▼'}
                            </span>
                          </button>

                          {/* Topics List in Chapter */}
                          {isExpanded && (
                            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#ffffff' }}>
                              {ch.topics.map((t) => {
                                const isReady = t.status === 'approved' || t.status === 'generated';
                                const isGenerating = t.status === 'generating';
                                const cleanTopicName = (t.name || '').replace(/^(?:Topic\s*)?\d+(\.\d+)?[:\s\-]*/i, '');
                                const topicDisplayTitle = `Topic ${ch.chapter_number}.${t.topic_number || 1}: ${cleanTopicName}`;

                                return (
                                  <div
                                    key={t.id}
                                    style={{
                                      border: '1px solid #e5e7eb',
                                      borderRadius: '16px',
                                      padding: '16px 20px',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      flexWrap: 'wrap',
                                      gap: '14px',
                                      backgroundColor: '#fcfbf7'
                                    }}
                                  >
                                    <div style={{ flex: '1 1 320px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 800, fontSize: '16px', color: '#3b2a49' }}>
                                          {topicDisplayTitle}
                                        </span>
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#4b5563', backgroundColor: '#e5e7eb', padding: '2px 8px', borderRadius: '6px' }}>
                                          Pages {t.start_page}–{t.end_page}
                                        </span>
                                        {isReady && (
                                          <span style={{ backgroundColor: '#dcfce7', color: '#15803d', fontSize: '12px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px' }}>
                                            ✓ Ready to Play
                                          </span>
                                        )}
                                        {isGenerating && (
                                          <span style={{ backgroundColor: '#fef3c7', color: '#b45309', fontSize: '12px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px' }}>
                                            ⚙️ Generating...
                                          </span>
                                        )}
                                        {!isReady && !isGenerating && (
                                          <span style={{ backgroundColor: '#e0e7ff', color: '#3730a3', fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '6px' }}>
                                            CHUNKED
                                          </span>
                                        )}
                                      </div>

                                      {t.description && (
                                        <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#4b5563', lineHeight: '1.4' }}>
                                          {t.description}
                                        </p>
                                      )}

                                      <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 600 }}>
                                          ⏱ {t.estimated_minutes || 5} mins
                                        </span>
                                        {t.cognitive_flags?.map((flag, idx) => (
                                          <span
                                            key={idx}
                                            style={{
                                              fontSize: '11px',
                                              backgroundColor: '#e0e7ff',
                                              color: '#3730a3',
                                              padding: '2px 8px',
                                              borderRadius: '6px',
                                              fontWeight: 700
                                            }}
                                          >
                                            {flag}
                                          </span>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                      {!isReady && !isGenerating && (
                                        <button
                                          type="button"
                                          onClick={() => handleGenerateLesson(t.id)}
                                          style={{
                                            backgroundColor: '#6a9a73',
                                            color: '#ffffff',
                                            fontWeight: 700,
                                            fontSize: '14px',
                                            padding: '8px 18px',
                                            borderRadius: '9999px',
                                            border: 'none',
                                            cursor: 'pointer',
                                            boxShadow: '0 3px 0 #4f7757'
                                          }}
                                        >
                                          ✨ Generate Lesson & Quiz
                                        </button>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => handleViewTrace(t)}
                                        style={{
                                          backgroundColor: '#ffffff',
                                          color: '#4a315d',
                                          border: '2px solid #cca9ef',
                                          fontWeight: 700,
                                          fontSize: '13px',
                                          padding: '7px 14px',
                                          borderRadius: '9999px',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        🔍 View Agent Steps
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
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
        )}
      </div>

      {/* ==============================================================
         AGENT TRACE MODAL
         ============================================================== */}
      {selectedTopicSteps && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '24px',
              padding: '28px',
              width: '100%',
              maxWidth: '650px',
              maxHeight: '85vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              border: '6px solid #cca9ef'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: '#4a315d' }}>
                Agent Trace: {selectedTopicSteps.name}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedTopicSteps(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '22px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  color: '#6b7280'
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {traceLogs.length === 0 ? (
                <p style={{ color: '#6b7280', fontWeight: 600 }}>No agent step logs recorded yet for this topic.</p>
              ) : (
                traceLogs.map((log, index) => (
                  <div
                    key={index}
                    style={{
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      fontSize: '13px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 800, color: '#4a315d' }}>
                        Step {log.step_number}: {log.agent_name}
                      </span>
                      <span style={{ color: '#64748b', fontSize: '11px' }}>
                        {new Date(log.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div style={{ color: '#0369a1', fontWeight: 700, fontSize: '12px', marginBottom: '4px' }}>
                      Tool: {log.tool_name}
                    </div>
                    {log.error ? (
                      <div style={{ color: '#b91c1c', fontWeight: 600 }}>Error: {log.error}</div>
                    ) : (
                      <div style={{ color: '#334155', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '12px' }}>
                        {log.output_summary}
                      </div>
                    )}
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
