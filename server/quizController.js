const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const sessionFilePath = path.join(dataDir, "session.json");

const defaultState = {
  questions: [],
  currentQuestionIndex: -1,
  quizStarted: false,
  quizFinished: false,
  teams: {},
  answers: {},
  submissions: {}
};

let state = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(sessionFilePath)) {
    fs.writeFileSync(sessionFilePath, JSON.stringify(defaultState, null, 2), "utf8");
  }
}

function loadState() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(sessionFilePath, "utf8");
    const parsed = JSON.parse(raw);
    state = {
      ...clone(defaultState),
      ...parsed,
      questions: Array.isArray(parsed.questions) ? parsed.questions.map(normalizeQuestionShape) : [],
      teams: parsed.teams || {},
      answers: parsed.answers || {},
      submissions: parsed.submissions || {}
    };
  } catch (error) {
    state = clone(defaultState);
    saveState();
  }
}

function saveState() {
  ensureDataFile();
  fs.writeFileSync(sessionFilePath, JSON.stringify(state, null, 2), "utf8");
}

function getState() {
  return state;
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

function getCurrentQuestion() {
  if (state.currentQuestionIndex < 0 || state.currentQuestionIndex >= state.questions.length) {
    return null;
  }
  return state.questions[state.currentQuestionIndex];
}

function getSessionForAdmin() {
  return {
    ...state,
    currentQuestion: getCurrentQuestion()
  };
}

function getSessionForTeam(teamId) {
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
    currentQuestion: getPublicQuestion(getCurrentQuestion())
  };
}

function setQuestions(questions) {
  state.questions = (questions || []).map(normalizeQuestionShape);
  state.currentQuestionIndex = questions.length > 0 ? 0 : -1;
  state.quizStarted = false;
  state.quizFinished = false;
  state.answers = {};
  state.submissions = {};
  saveState();
  return getSessionForAdmin();
}

function clearQuiz() {
  state = clone(defaultState);
  saveState();
  return getSessionForAdmin();
}

function clearTeams() {
  state.teams = {};
  state.answers = {};
  state.submissions = {};
  saveState();
  return getSessionForAdmin();
}

function startQuiz() {
  if (state.questions.length === 0) {
    return false;
  }
  state.quizStarted = true;
  state.quizFinished = false;
  if (state.currentQuestionIndex < 0) {
    state.currentQuestionIndex = 0;
  }
  saveState();
  return true;
}

function finishQuiz() {
  state.quizFinished = true;
  state.quizStarted = false;
  saveState();
}

function setCurrentQuestionIndex(index) {
  if (state.questions.length === 0) return false;
  if (index < 0 || index >= state.questions.length) return false;
  state.currentQuestionIndex = index;
  saveState();
  return true;
}

function resetTeamRecordsByName(teamName) {
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

function registerOrReconnectTeam({ teamId, teamName, resetExisting }) {
  let id = (teamId || "").trim();
  const name = (teamName || "").trim();
  if (!name) {
    return { error: "Team name is required." };
  }
  let resetCount = 0;
  if (Boolean(resetExisting)) {
    resetCount = resetTeamRecordsByName(name);
    id = "";
  }
  if (!id) {
    id = `team_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  }

  if (!state.teams[id]) {
    state.teams[id] = { id, name, joinedAt: Date.now(), approved: false };
  } else {
    state.teams[id].name = name;
    if (typeof state.teams[id].approved !== "boolean") {
      state.teams[id].approved = false;
    }
  }

  if (!state.answers[id]) {
    state.answers[id] = { score: 0 };
  }
  if (!state.submissions[id]) {
    state.submissions[id] = {};
  }

  saveState();
  return { team: state.teams[id], approved: Boolean(state.teams[id].approved), resetCount };
}

function approveTeam(teamId) {
  const team = state.teams[teamId];
  if (!team) return { error: "Team not found." };
  team.approved = true;
  saveState();
  return { ok: true, team };
}

function kickTeam(teamId) {
  const team = state.teams[teamId];
  if (!team) return { error: "Team not found." };
  delete state.teams[teamId];
  delete state.answers[teamId];
  delete state.submissions[teamId];
  saveState();
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

function submitAnswer({ teamId, questionIndex, answers }) {
  const team = state.teams[teamId];
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

  recalculateScores();
  saveState();
  return { ok: true };
}

function editTeamAnswer({ teamId, questionIndex, answers, isCorrect }) {
  const question = state.questions[questionIndex];
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
    // Keep original order stable in admin table after manual edits.
    updatedAt: existing && existing.updatedAt ? existing.updatedAt : Date.now(),
    isCorrect: manualIsCorrect === null ? autoIsCorrect : manualIsCorrect,
    manualIsCorrect,
    editedByAdmin: true
  };

  recalculateScores();
  saveState();
  return { ok: true };
}

function recalculateScores() {
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

function getLeaderboard() {
  return Object.values(state.teams)
    .filter((team) => Boolean(team.approved))
    .map((team) => ({
      id: team.id,
      name: team.name,
      score: state.answers[team.id]?.score || 0
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function getSubmissionsView() {
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

loadState();

module.exports = {
  getState,
  getPublicQuestion,
  getCurrentQuestion,
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
  submitAnswer,
  editTeamAnswer,
  getLeaderboard,
  getSubmissionsView
};
