const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const dataDir = path.join(__dirname, "..", "data");
const sessionsDir = path.join(dataDir, "sessions");
const legacySessionFilePath = path.join(dataDir, "session.json");
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{8,32}$/;

const defaultState = {
  questions: [],
  currentQuestionIndex: -1,
  quizStarted: false,
  quizFinished: false,
  teams: {},
  answers: {},
  submissions: {}
};

const sessions = new Map();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeSessionId(sessionId) {
  const id = String(sessionId || "").trim();
  if (!SESSION_ID_RE.test(id)) return null;
  return id;
}

function generateSessionId() {
  return crypto.randomBytes(6).toString("hex");
}

function inferMediaKindFromUrl(mediaURL) {
  const url = String(mediaURL || "").trim().toLowerCase();
  if (!url) return "";
  const base = url.split("?")[0].split("#")[0];
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(base)) return "image";
  if (/\.(mp4|webm|mov|m4v|ogv)$/.test(base)) return "video";
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(base)) return "audio";
  return "";
}

function normalizeQuestionShape(question) {
  if (!question) return question;
  const normalized = { ...question };
  const legacyType = String(normalized.type || "").trim().toLowerCase();
  const options = Array.isArray(normalized.options) ? normalized.options : [];
  let answerType = String(normalized.answerType || "").trim().toLowerCase();
  if (!answerType) {
    if (legacyType === "multiple-choice" || legacyType === "short-answer" || legacyType === "true-false") {
      answerType = legacyType;
    } else {
      answerType = options.length ? "multiple-choice" : "short-answer";
    }
  }
  let mediaKind = String(normalized.mediaKind || "").trim().toLowerCase();
  if (!mediaKind) {
    if (legacyType === "image" || legacyType === "video" || legacyType === "audio") {
      mediaKind = legacyType;
    } else {
      mediaKind = inferMediaKindFromUrl(normalized.mediaURL);
    }
  }
  normalized.answerType = answerType;
  normalized.mediaKind = mediaKind || "";
  normalized.type = answerType;
  return normalized;
}

function ensureDataDirs() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }
}

function sessionFilePath(sessionId) {
  return path.join(sessionsDir, sessionId + ".json");
}

function migrateLegacySessionFile() {
  ensureDataDirs();
  if (!fs.existsSync(legacySessionFilePath)) return;
  const target = sessionFilePath("default");
  if (fs.existsSync(target)) return;
  try {
    fs.copyFileSync(legacySessionFilePath, target);
  } catch (error) {
    // Ignore migration errors.
  }
}

function parseStateFromRaw(parsed) {
  return {
    ...clone(defaultState),
    ...parsed,
    questions: Array.isArray(parsed.questions) ? parsed.questions.map(normalizeQuestionShape) : [],
    teams: parsed.teams || {},
    answers: parsed.answers || {},
    submissions: parsed.submissions || {}
  };
}

function loadSessionFromDisk(sessionId) {
  ensureDataDirs();
  const filePath = sessionFilePath(sessionId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const state = parseStateFromRaw(parsed);
    Object.keys(state.teams).forEach((teamId) => {
      if (typeof state.teams[teamId].away !== "boolean") {
        state.teams[teamId].away = false;
      }
    });
    return state;
  } catch (error) {
    return null;
  }
}

function saveSessionToDisk(sessionId, state) {
  ensureDataDirs();
  fs.writeFileSync(sessionFilePath(sessionId), JSON.stringify(state, null, 2), "utf8");
}

function getState(sessionId) {
  const id = normalizeSessionId(sessionId);
  if (!id) return null;
  if (!sessions.has(id)) {
    const loaded = loadSessionFromDisk(id);
    if (!loaded) return null;
    sessions.set(id, loaded);
  }
  return sessions.get(id);
}

function ensureSession(sessionId) {
  const id = normalizeSessionId(sessionId);
  if (!id) return null;
  if (!sessions.has(id)) {
    const loaded = loadSessionFromDisk(id);
    if (loaded) {
      sessions.set(id, loaded);
      return id;
    }
    const state = clone(defaultState);
    sessions.set(id, state);
    saveSessionToDisk(id, state);
  }
  return id;
}

function sessionExists(sessionId) {
  const id = normalizeSessionId(sessionId);
  if (!id) return false;
  if (sessions.has(id)) return true;
  return fs.existsSync(sessionFilePath(id));
}

function saveState(sessionId) {
  const state = getState(sessionId);
  if (!state) return;
  saveSessionToDisk(sessionId, state);
}

function createSession() {
  ensureDataDirs();
  let id = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = generateSessionId();
    if (!sessionExists(candidate)) {
      id = candidate;
      break;
    }
  }
  if (!id) {
    id = generateSessionId() + Date.now().toString(16).slice(-4);
  }
  ensureSession(id);
  return {
    id,
    createdAt: Date.now()
  };
}

function listSessions() {
  ensureDataDirs();
  migrateLegacySessionFile();
  const ids = new Set();
  if (fs.existsSync(sessionsDir)) {
    fs.readdirSync(sessionsDir).forEach((name) => {
      if (!name.endsWith(".json")) return;
      const id = name.slice(0, -5);
      if (normalizeSessionId(id)) ids.add(id);
    });
  }
  sessions.forEach((_state, id) => {
    if (normalizeSessionId(id)) ids.add(id);
  });
  return Array.from(ids)
    .sort()
    .map((id) => {
      const state = getState(id) || clone(defaultState);
      const teamCount = Object.keys(state.teams || {}).length;
      const questionCount = (state.questions || []).length;
      let updatedAt = 0;
      try {
        updatedAt = fs.statSync(sessionFilePath(id)).mtimeMs;
      } catch (error) {
        updatedAt = 0;
      }
      return {
        id,
        teamCount,
        questionCount,
        quizStarted: Boolean(state.quizStarted),
        quizFinished: Boolean(state.quizFinished),
        updatedAt
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function deleteSession(sessionId) {
  const id = normalizeSessionId(sessionId);
  if (!id) return { error: "Invalid session id." };
  sessions.delete(id);
  const filePath = sessionFilePath(id);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      return { error: "Failed to delete session." };
    }
  }
  return { ok: true, id };
}

function getPublicQuestion(question) {
  if (!question) return null;
  const normalized = normalizeQuestionShape(question);
  return {
    id: normalized.id,
    type: normalized.answerType,
    answerType: normalized.answerType,
    mediaKind: normalized.mediaKind || "",
    questionText: normalized.questionText,
    options: normalized.options || [],
    mediaURL: normalized.mediaURL || ""
  };
}

function getCurrentQuestion(state) {
  if (state.currentQuestionIndex < 0 || state.currentQuestionIndex >= state.questions.length) {
    return null;
  }
  return state.questions[state.currentQuestionIndex];
}

function getSessionForAdmin(sessionId) {
  const state = getState(sessionId);
  if (!state) return null;
  return {
    ...state,
    currentQuestion: getCurrentQuestion(state)
  };
}

function getSessionForTeam(sessionId, teamId) {
  const state = getState(sessionId);
  if (!state) return null;
  const team = state.teams[teamId] || null;
  const approved = Boolean(team && team.approved);
  const hasSubmittedCurrentQuestion =
    Boolean(state.submissions[teamId]) &&
    state.currentQuestionIndex >= 0 &&
    Boolean(state.submissions[teamId][state.currentQuestionIndex]);
  return {
    team,
    teamId,
    approved,
    hasSubmittedCurrentQuestion,
    score: state.answers[teamId]?.score || 0,
    quizStarted: state.quizStarted,
    quizFinished: state.quizFinished,
    currentQuestionIndex: state.currentQuestionIndex,
    currentQuestion: getPublicQuestion(getCurrentQuestion(state))
  };
}

function setQuestions(sessionId, questions) {
  const state = getState(sessionId);
  if (!state) return null;
  state.questions = (questions || []).map(normalizeQuestionShape);
  state.currentQuestionIndex = questions.length > 0 ? 0 : -1;
  state.quizStarted = false;
  state.quizFinished = false;
  state.answers = {};
  state.submissions = {};
  saveState(sessionId);
  return getSessionForAdmin(sessionId);
}

function clearQuiz(sessionId) {
  const id = ensureSession(sessionId);
  if (!id) return null;
  const state = clone(defaultState);
  sessions.set(id, state);
  saveState(id);
  return getSessionForAdmin(id);
}

function clearTeams(sessionId) {
  const state = getState(sessionId);
  if (!state) return null;
  state.teams = {};
  state.answers = {};
  state.submissions = {};
  saveState(sessionId);
  return getSessionForAdmin(sessionId);
}

function startQuiz(sessionId) {
  const state = getState(sessionId);
  if (!state || state.questions.length === 0) return false;
  state.quizStarted = true;
  state.quizFinished = false;
  if (state.currentQuestionIndex < 0) {
    state.currentQuestionIndex = 0;
  }
  saveState(sessionId);
  return true;
}

function finishQuiz(sessionId) {
  const state = getState(sessionId);
  if (!state) return;
  state.quizFinished = true;
  state.quizStarted = false;
  saveState(sessionId);
}

function setCurrentQuestionIndex(sessionId, index) {
  const state = getState(sessionId);
  if (!state || state.questions.length === 0) return false;
  if (index < 0 || index >= state.questions.length) return false;
  state.currentQuestionIndex = index;
  saveState(sessionId);
  return true;
}

function resetTeamRecordsByName(state, teamName) {
  const normalized = String(teamName || "").trim().toLowerCase();
  if (!normalized) return 0;
  let removed = 0;
  Object.keys(state.teams).forEach((teamId) => {
    const name = String(state.teams[teamId]?.name || "").trim().toLowerCase();
    if (name !== normalized) return;
    delete state.teams[teamId];
    delete state.answers[teamId];
    delete state.submissions[teamId];
    removed += 1;
  });
  return removed;
}

function registerOrReconnectTeam(sessionId, { teamId, teamName, resetExisting }) {
  const state = getState(sessionId);
  if (!state) return { error: "Session not found." };
  let id = (teamId || "").trim();
  const name = (teamName || "").trim();
  if (!name) {
    return { error: "Team name is required." };
  }
  let resetCount = 0;
  if (Boolean(resetExisting)) {
    resetCount = resetTeamRecordsByName(state, name);
    id = "";
  }
  if (!id) {
    id = `team_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  }

  if (!state.teams[id]) {
    state.teams[id] = { id, name, joinedAt: Date.now(), approved: false, away: false };
  } else {
    state.teams[id].name = name;
    if (typeof state.teams[id].approved !== "boolean") {
      state.teams[id].approved = false;
    }
    if (typeof state.teams[id].away !== "boolean") {
      state.teams[id].away = false;
    }
  }

  if (!state.answers[id]) {
    state.answers[id] = { score: 0 };
  }
  if (!state.submissions[id]) {
    state.submissions[id] = {};
  }

  saveState(sessionId);
  return { team: state.teams[id], approved: Boolean(state.teams[id].approved), resetCount };
}

function approveTeam(sessionId, teamId) {
  const state = getState(sessionId);
  const team = state && state.teams[teamId];
  if (!team) return { error: "Team not found." };
  team.approved = true;
  saveState(sessionId);
  return { ok: true, team };
}

function kickTeam(sessionId, teamId) {
  const state = getState(sessionId);
  const team = state && state.teams[teamId];
  if (!team) return { error: "Team not found." };
  delete state.teams[teamId];
  delete state.answers[teamId];
  delete state.submissions[teamId];
  saveState(sessionId);
  return { ok: true, team };
}

function setTeamAway(sessionId, teamId, away) {
  const state = getState(sessionId);
  const team = state && state.teams[teamId];
  if (!team) return { error: "Team not found." };
  team.away = Boolean(away);
  saveState(sessionId);
  return { ok: true, team };
}

function normalizeAnswers(input) {
  if (Array.isArray(input)) {
    return input.map((v) => String(v).trim()).filter(Boolean);
  }
  const text = String(input || "").trim();
  if (!text) return [];
  return text
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean);
}

function compareAnswers(question, submittedAnswers) {
  const correct = new Set((question.correctAnswers || []).map((a) => a.toLowerCase()));
  const actual = new Set(submittedAnswers.map((a) => a.toLowerCase()));
  if (correct.size !== actual.size) return false;
  for (const item of correct) {
    if (!actual.has(item)) return false;
  }
  return true;
}

function recalculateScores(state) {
  Object.keys(state.teams).forEach((teamId) => {
    const byTeam = state.submissions[teamId] || {};
    let score = 0;
    Object.keys(byTeam).forEach((qIdx) => {
      if (byTeam[qIdx].isCorrect) score += 1;
    });
    if (!state.answers[teamId]) state.answers[teamId] = {};
    state.answers[teamId].score = score;
  });
}

function submitAnswer(sessionId, { teamId, questionIndex, answers }) {
  const state = getState(sessionId);
  const team = state && state.teams[teamId];
  if (!team) return { error: "Team not found." };
  if (!team.approved) return { error: "Waiting for admin approval." };
  if (questionIndex !== state.currentQuestionIndex) return { error: "Question index mismatch." };
  const question = state.questions[questionIndex];
  if (!question) return { error: "Question not found." };

  const normalized = normalizeAnswers(answers);
  if (!state.submissions[teamId]) state.submissions[teamId] = {};
  if (state.submissions[teamId][questionIndex]) {
    return { error: "You have already submitted an answer for this question." };
  }

  state.submissions[teamId][questionIndex] = {
    answers: normalized,
    updatedAt: Date.now(),
    isCorrect: compareAnswers(question, normalized),
    manualIsCorrect: null
  };

  recalculateScores(state);
  saveState(sessionId);
  return { ok: true };
}

function editTeamAnswer(sessionId, { teamId, questionIndex, answers, isCorrect }) {
  const state = getState(sessionId);
  const question = state && state.questions[questionIndex];
  if (!question) return { error: "Question not found." };
  if (!state.teams[teamId]) return { error: "Team not found." };
  if (!state.submissions[teamId]) state.submissions[teamId] = {};
  const existing = state.submissions[teamId][questionIndex] || null;

  const normalized = normalizeAnswers(answers);
  const autoIsCorrect = compareAnswers(question, normalized);
  let manualIsCorrect = state.submissions[teamId][questionIndex]?.manualIsCorrect ?? null;
  if (isCorrect === null) {
    manualIsCorrect = null;
  } else if (typeof isCorrect === "boolean") {
    manualIsCorrect = isCorrect;
  }

  state.submissions[teamId][questionIndex] = {
    answers: normalized,
    updatedAt: existing && existing.updatedAt ? existing.updatedAt : Date.now(),
    isCorrect: manualIsCorrect === null ? autoIsCorrect : manualIsCorrect,
    manualIsCorrect,
    editedByAdmin: true
  };

  recalculateScores(state);
  saveState(sessionId);
  return { ok: true };
}

function getLeaderboard(sessionId) {
  const state = getState(sessionId);
  if (!state) return [];
  return Object.values(state.teams)
    .filter((team) => Boolean(team.approved))
    .map((team) => ({
      id: team.id,
      name: team.name,
      score: state.answers[team.id]?.score || 0
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function getSubmissionsView(sessionId) {
  const state = getState(sessionId);
  if (!state) return [];
  const rows = [];
  Object.keys(state.submissions).forEach((teamId) => {
    const teamName = state.teams[teamId]?.name || teamId;
    Object.keys(state.submissions[teamId]).forEach((qIdx) => {
      const submission = state.submissions[teamId][qIdx];
      rows.push({
        teamId,
        teamName,
        questionIndex: Number(qIdx),
        answers: submission.answers || [],
        isCorrect: Boolean(submission.isCorrect),
        manualIsCorrect: typeof submission.manualIsCorrect === "boolean" ? submission.manualIsCorrect : null,
        updatedAt: submission.updatedAt || 0,
        editedByAdmin: Boolean(submission.editedByAdmin)
      });
    });
  });
  rows.sort((a, b) => a.updatedAt - b.updatedAt);
  return rows;
}

migrateLegacySessionFile();
ensureDataDirs();
if (sessionExists("default")) {
  getState("default");
}

module.exports = {
  SESSION_ID_RE,
  normalizeSessionId,
  sessionExists,
  createSession,
  listSessions,
  deleteSession,
  getState,
  getPublicQuestion,
  getCurrentQuestion: (sessionId) => {
    const state = getState(sessionId);
    return state ? getCurrentQuestion(state) : null;
  },
  getSessionForAdmin,
  getSessionForTeam,
  setQuestions,
  clearQuiz,
  clearTeams,
  startQuiz,
  finishQuiz,
  setCurrentQuestionIndex,
  registerOrReconnectTeam,
  approveTeam,
  kickTeam,
  setTeamAway,
  submitAnswer,
  editTeamAnswer,
  getLeaderboard,
  getSubmissionsView
};
