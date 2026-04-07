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
  return {
    id: question.id,
    type: question.type,
    questionText: question.questionText,
    options: question.options || [],
    mediaURL: question.mediaURL || ""
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
  return {
    team,
    teamId,
    score: state.answers[teamId]?.score || 0,
    quizStarted: state.quizStarted,
    quizFinished: state.quizFinished,
    currentQuestionIndex: state.currentQuestionIndex,
    currentQuestion: getPublicQuestion(getCurrentQuestion())
  };
}

function setQuestions(questions) {
  state.questions = questions;
  state.currentQuestionIndex = questions.length > 0 ? 0 : -1;
  state.quizStarted = false;
  state.quizFinished = false;
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

function registerOrReconnectTeam({ teamId, teamName }) {
  const id = (teamId || "").trim() || `team_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const name = (teamName || "").trim();
  if (!name) {
    return { error: "Team name is required." };
  }

  if (!state.teams[id]) {
    state.teams[id] = { id, name, joinedAt: Date.now() };
  } else {
    state.teams[id].name = name;
  }

  if (!state.answers[id]) {
    state.answers[id] = { score: 0 };
  }
  if (!state.submissions[id]) {
    state.submissions[id] = {};
  }

  saveState();
  return { team: state.teams[id] };
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
  if (questionIndex !== state.currentQuestionIndex) return { error: "Question index mismatch." };
  const question = state.questions[questionIndex];
  if (!question) return { error: "Question not found." };

  const normalized = normalizeAnswers(answers);
  if (!state.submissions[teamId]) state.submissions[teamId] = {};

  state.submissions[teamId][questionIndex] = {
    answers: normalized,
    updatedAt: Date.now(),
    isCorrect: compareAnswers(question, normalized)
  };

  recalculateScores();
  saveState();
  return { ok: true };
}

function editTeamAnswer({ teamId, questionIndex, answers }) {
  const question = state.questions[questionIndex];
  if (!question) return { error: "Question not found." };
  if (!state.teams[teamId]) return { error: "Team not found." };
  if (!state.submissions[teamId]) state.submissions[teamId] = {};

  const normalized = normalizeAnswers(answers);
  state.submissions[teamId][questionIndex] = {
    answers: normalized,
    updatedAt: Date.now(),
    isCorrect: compareAnswers(question, normalized),
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
        updatedAt: submission.updatedAt || 0,
        editedByAdmin: Boolean(submission.editedByAdmin)
      });
    });
  });
  rows.sort((a, b) => b.updatedAt - a.updatedAt);
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
  startQuiz,
  finishQuiz,
  setCurrentQuestionIndex,
  registerOrReconnectTeam,
  submitAnswer,
  editTeamAnswer,
  getLeaderboard,
  getSubmissionsView
};
