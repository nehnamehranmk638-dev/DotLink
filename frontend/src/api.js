let rawApiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
if (rawApiBase && !rawApiBase.startsWith('http://') && !rawApiBase.startsWith('https://')) {
  rawApiBase = `https://${rawApiBase}`;
}
const API_BASE = rawApiBase.replace(/\/+$/, '');

function getAuthHeader() {
  const token = localStorage.getItem('dotlink_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function formatErrorMessage(err, fallback = 'Operation failed') {
  if (!err) return fallback;
  if (typeof err.detail === 'string') return err.detail;
  if (Array.isArray(err.detail)) {
    return err.detail
      .map((item) => {
        if (typeof item === 'string') return item;
        const field = item.loc && item.loc.length > 1 ? item.loc[item.loc.length - 1] : '';
        const msg = item.msg || 'Validation error';
        return field ? `${field}: ${msg}` : msg;
      })
      .join(', ');
  }
  if (err.detail && typeof err.detail === 'object') {
    return err.detail.msg || JSON.stringify(err.detail);
  }
  if (typeof err.message === 'string') return err.message;
  return fallback;
}

export const api = {
  // Auth
  async signup(name, email, password, consentGiven) {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, consent_given: consentGiven })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Signup failed'));
    }
    const data = await res.json();
    localStorage.setItem('dotlink_token', data.access_token);
    localStorage.setItem('dotlink_user', JSON.stringify(data.user));
    return data;
  },

  async login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Login failed'));
    }
    const data = await res.json();
    localStorage.setItem('dotlink_token', data.access_token);
    localStorage.setItem('dotlink_user', JSON.stringify(data.user));
    return data;
  },

  logout() {
    localStorage.removeItem('dotlink_token');
    localStorage.removeItem('dotlink_user');
    localStorage.removeItem('dotlink_active_child');
  },

  getUser() {
    const u = localStorage.getItem('dotlink_user');
    return u ? JSON.parse(u) : null;
  },

  getActiveChild() {
    const c = localStorage.getItem('dotlink_active_child');
    return c ? JSON.parse(c) : null;
  },

  setActiveChild(child) {
    localStorage.setItem('dotlink_active_child', JSON.stringify(child));
  },

  // Children
  async getChildren() {
    const res = await fetch(`${API_BASE}/children`, {
      headers: { ...getAuthHeader() }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to fetch children'));
    }
    return res.json();
  },

  async createChild(childData) {
    const res = await fetch(`${API_BASE}/children`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(childData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to create child profile'));
    }
    return res.json();
  },

  async getQuizQuestions(sessionId, quizSet) {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/quiz-questions?quiz_set=${quizSet}`, { headers: getAuthHeader() });
    if (!response.ok) throw new Error('Could not load your quiz. Please try again.');
    return response.json();
  },

  // Curriculum & Textbooks
  async uploadAndChunkTextbook(formData) {
    const res = await fetch(`${API_BASE}/curriculum/upload-textbook`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to upload and chunk textbook'));
    }
    return res.json();
  },

  async fetchAndChunk(formData) {
    const res = await fetch(`${API_BASE}/ncert/fetch-and-chunk`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to fetch and chunk NCERT chapter'));
    }
    return res.json();
  },

  async getTextbooks() {
    const res = await fetch(`${API_BASE}/textbooks`, {
      headers: { ...getAuthHeader() }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to fetch textbooks'));
    }
    return res.json();
  },

  async getTopics(textbookId) {
    const res = await fetch(`${API_BASE}/textbooks/${textbookId}/topics`, {
      headers: { ...getAuthHeader() }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to fetch topics'));
    }
    return res.json();
  },

  async getTopic(topicId) {
    const res = await fetch(`${API_BASE}/topics/${topicId}`, {
      headers: { ...getAuthHeader() }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to fetch topic'));
    }
    return res.json();
  },

  async generateLesson(topicId) {
    const res = await fetch(`${API_BASE}/topics/${topicId}/generate`, {
      method: 'POST',
      headers: { ...getAuthHeader() }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to trigger lesson generation'));
    }
    return res.json();
  },

  async getAgentSteps(topicId) {
    const res = await fetch(`${API_BASE}/topics/${topicId}/agent-steps`, {
      headers: { ...getAuthHeader() }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to fetch agent trace'));
    }
    return res.json();
  },

  async getLessonBundle(topicId) {
    const res = await fetch(`${API_BASE}/topics/${topicId}/lesson-bundle`, {
      headers: { ...getAuthHeader() }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to fetch lesson bundle'));
    }
    return res.json();
  },

  async updateLessonBundle(topicId, patch) {
    const res = await fetch(`${API_BASE}/topics/${topicId}/lesson-bundle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(patch)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to update lesson bundle'));
    }
    return res.json();
  },

  async getQuestions(topicId) {
    const res = await fetch(`${API_BASE}/topics/${topicId}/questions`, {
      headers: { ...getAuthHeader() }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to fetch questions'));
    }
    return res.json();
  },

  async patchQuestion(questionId, patch) {
    const res = await fetch(`${API_BASE}/questions/${questionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(patch)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to update question'));
    }
    return res.json();
  },

  async deleteQuestion(questionId) {
    const res = await fetch(`${API_BASE}/questions/${questionId}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to delete question'));
    }
    return res.json();
  },

  async getSourcePages(topicId) {
    const res = await fetch(`${API_BASE}/topics/${topicId}/source-pages`, {
      headers: { ...getAuthHeader() }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to fetch source pages'));
    }
    return res.json();
  },

  async approveTopic(topicId) {
    const res = await fetch(`${API_BASE}/topics/${topicId}/approve`, {
      method: 'POST',
      headers: { ...getAuthHeader() }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Approval blocked'));
    }
    return res.json();
  },

  // Sessions & Live Adaptive Interaction
  async getPlayTopics(childId) {
    const res = await fetch(`${API_BASE}/play/topics/${childId}`, {
      headers: { ...getAuthHeader() }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Could not load lessons'));
    }
    return res.json();
  },

  async startOrResumeSession(childId, topicId) {
    const res = await fetch(`${API_BASE}/sessions/start-or-resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ child_id: childId, topic_id: topicId })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to start/resume session'));
    }
    return res.json();
  },

  async getSessionDetails(sessionId) {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/details`, { headers: getAuthHeader() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Could not load this lesson'));
    }
    return res.json();
  },

  async updateSessionScene(sessionId, sceneIndex) {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/update-scene`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ scene_index: sceneIndex })
    });
    if (!res.ok) throw new Error('Could not save lesson progress');
    return res.json();
  },

  async pauseSession(sessionId, sceneIndex) {
    const res = await fetch(`${API_BASE}/sessions/${sessionId}/pause`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ scene_index: sceneIndex })
    });
    if (!res.ok) throw new Error('Could not pause this lesson');
    return res.json();
  },

  async adaptiveInteract(payload) {
    const res = await fetch(`${API_BASE}/api/adaptive/interact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to evaluate interaction'));
    }
    return res.json();
  },

  async postIdle(sessionId, payload) {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/idle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async postHeartbeat(sessionId) {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/heartbeat`, {
      method: 'POST',
      headers: { ...getAuthHeader() }
    });
    return res.json();
  },

  async submitQuiz(sessionId, payload) {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/quiz-submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to submit quiz'));
    }
    return res.json();
  },

  async getAnalytics(childId) {
    const res = await fetch(`${API_BASE}/api/analytics/${childId}`, {
      headers: { ...getAuthHeader() }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(formatErrorMessage(err, 'Failed to fetch analytics'));
    }
    return res.json();
  },

  getLiveStreamUrl(childId) {
    const token = localStorage.getItem('dotlink_token') || '';
    return `${API_BASE}/api/live/${childId}?token=${encodeURIComponent(token)}`;
  }
};
