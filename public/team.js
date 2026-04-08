const socket = io("/team");

const registerCard = document.getElementById("registerCard");
const quizCard = document.getElementById("quizCard");
const teamNameInput = document.getElementById("teamName");
const joinBtn = document.getElementById("joinBtn");
const questionTitle = document.getElementById("questionTitle");
const optionsEl = document.getElementById("options");
const mediaEl = document.getElementById("media");
const answerInput = document.getElementById("answerInput");
const submitBtn = document.getElementById("submitBtn");
const msgEl = document.getElementById("msg");
const headerEl = document.getElementById("header");

var params = new URLSearchParams(window.location.search);
var urlTeamId = params.get("teamId") || params.get("tid") || "";

let teamId = urlTeamId || localStorage.getItem("quiz_team_id") || "";
let teamName = localStorage.getItem("quiz_team_name") || "";
let currentQuestionIndex = -1;
let currentQuestion = null;
let score = 0;
let quizStarted = false;
let quizFinished = false;

if (teamName) {
  teamNameInput.value = teamName;
}

if (urlTeamId) {
  localStorage.setItem("quiz_team_id", urlTeamId);
}

function setMessage(text) {
  msgEl.textContent = text;
}

function renderMedia(question) {
  mediaEl.innerHTML = "";
  if (!question || !question.mediaURL) return;
  if (question.type === "image") {
    mediaEl.innerHTML = `<img src="${question.mediaURL}" alt="question media" />`;
  } else if (question.type === "video") {
    mediaEl.innerHTML = `<video src="${question.mediaURL}" controls></video>`;
  } else if (question.type === "audio") {
    mediaEl.innerHTML = `<audio src="${question.mediaURL}" controls></audio>`;
  }
}

function renderQuestion(question) {
  currentQuestion = question;
  if (!question) {
    questionTitle.textContent = quizFinished ? "Quiz finished." : "Waiting for next question...";
    optionsEl.innerHTML = "";
    mediaEl.innerHTML = "";
    return;
  }
  questionTitle.textContent = `${question.type}: ${question.questionText}`;
  renderMedia(question);

  if (question.type === "multiple-choice" || question.type === "true-false") {
    optionsEl.innerHTML = (question.options || [])
      .map((opt, idx) => `<div>${idx + 1}. ${opt}</div>`)
      .join("");
  } else {
    optionsEl.innerHTML = "";
  }
}

function renderHeader() {
  headerEl.textContent = `Team: ${teamName || "-"} | Score: ${score} | Question: ${
    currentQuestionIndex >= 0 ? currentQuestionIndex + 1 : "-"
  } | Started: ${quizStarted ? "yes" : "no"} | Finished: ${quizFinished ? "yes" : "no"}`;
}

function showQuiz() {
  registerCard.style.display = "none";
  quizCard.style.display = "block";
}

function applySession(session) {
  if (!session) return;
  score = session.score || 0;
  quizStarted = Boolean(session.quizStarted);
  quizFinished = Boolean(session.quizFinished);
  currentQuestionIndex = Number(session.currentQuestionIndex ?? -1);
  renderQuestion(session.currentQuestion || null);
  renderHeader();
}

function registerTeam(forceTeamName) {
  const name = (forceTeamName || teamNameInput.value || "").trim();
  if (!name) {
    setMessage("Team name is required.");
    return;
  }
  socket.emit("team:register", { teamId, teamName: name });
}

joinBtn.addEventListener("click", () => {
  registerTeam();
});

submitBtn.addEventListener("click", () => {
  if (!teamId || currentQuestionIndex < 0) return;
  socket.emit("answer:submit", {
    teamId,
    questionIndex: currentQuestionIndex,
    answers: answerInput.value
  });
  setMessage("Answer submitted.");
});

socket.on("connect", () => {
  if (teamId && teamName) {
    registerTeam(teamName);
  }
});

socket.on("team:registered", (payload) => {
  teamId = payload.teamId;
  teamName = payload.team.name;
  localStorage.setItem("quiz_team_id", teamId);
  localStorage.setItem("quiz_team_name", teamName);
  showQuiz();
  applySession(payload.session);
  setMessage("Connected.");
});

socket.on("team:session", (session) => {
  applySession(session);
});

socket.on("quiz:state", (data) => {
  quizStarted = Boolean(data.quizStarted);
  quizFinished = Boolean(data.quizFinished);
  currentQuestionIndex = Number(data.currentQuestionIndex ?? -1);
  renderQuestion(data.currentQuestion || null);
  renderHeader();
});

socket.on("question:change", (data) => {
  currentQuestionIndex = Number(data.index);
  renderQuestion(data.currentQuestion || null);
  renderHeader();
});

socket.on("quiz:start", () => {
  quizStarted = true;
  quizFinished = false;
  renderHeader();
});

socket.on("quiz:finish", () => {
  quizFinished = true;
  quizStarted = false;
  renderQuestion(null);
  renderHeader();
});

socket.on("team:error", ({ message }) => {
  setMessage(message || "Unknown error");
});

if (teamId && teamName) {
  fetch(`/api/session/team/${encodeURIComponent(teamId)}`)
    .then((r) => r.json())
    .then((session) => {
      if (session.team) {
        showQuiz();
      }
      applySession(session);
    })
    .catch(() => {});
}
