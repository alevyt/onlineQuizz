const socket = io("/team");

const registerCard = document.getElementById("registerCard");
const quizCard = document.getElementById("quizCard");
const teamNameInput = document.getElementById("teamName");
const joinBtn = document.getElementById("joinBtn");
const resetPreviousTeamCheckbox = document.getElementById("resetPreviousTeamCheckbox");
const questionTitle = document.getElementById("questionTitle");
const optionsEl = document.getElementById("options");
const mediaEl = document.getElementById("media");
const answerInput = document.getElementById("answerInput");
const submitBtn = document.getElementById("submitBtn");
const skipBtn = document.getElementById("skipBtn");
const msgEl = document.getElementById("msg");
const headerEl = document.getElementById("header");
const timerStatusEl = document.getElementById("timerStatus");

var params = new URLSearchParams(window.location.search);
var urlTeamId = params.get("teamId") || params.get("tid") || "";

let teamId = urlTeamId || localStorage.getItem("quiz_team_id") || "";
let teamName = localStorage.getItem("quiz_team_name") || "";
let currentQuestionIndex = -1;
let currentQuestion = null;
let score = 0;
let quizStarted = false;
let quizFinished = false;
let approved = false;
let selectedOptions = [];
let hasSubmittedCurrentQuestion = false;
let timerState = { active: false, remainingSec: 0 };

function t(key, params, fallback) {
  return window.I18N ? window.I18N.t(key, params, fallback) : fallback || key;
}

if (teamName) {
  teamNameInput.value = teamName;
}

if (urlTeamId) {
  localStorage.setItem("quiz_team_id", urlTeamId);
}

function setMessage(text) {
  msgEl.textContent = text;
}

function renderTimerStatus() {
  if (!timerState.active) {
    timerStatusEl.textContent = "";
    return;
  }
  timerStatusEl.textContent = t("team.timerRunning", { seconds: timerState.remainingSec });
}

function redirectToResults() {
  if (!teamId) return;
  window.location.href = "/results?teamId=" + encodeURIComponent(teamId);
}

function renderMedia(question) {
  mediaEl.innerHTML = "";
  if (!question || !question.mediaURL) return;
  const mediaKind = question.mediaKind || "";
  if (mediaKind === "image") {
    mediaEl.innerHTML = `<img src="${question.mediaURL}" alt="${t("team.mediaAlt")}" />`;
  } else if (mediaKind === "video") {
    mediaEl.innerHTML = `<video src="${question.mediaURL}" controls></video>`;
  } else if (mediaKind === "audio") {
    mediaEl.innerHTML = `<audio src="${question.mediaURL}" controls></audio>`;
  } else {
    mediaEl.innerHTML = `<a href="${question.mediaURL}" target="_blank" rel="noopener noreferrer">${question.mediaURL}</a>`;
  }
}

function renderQuestion(question) {
  currentQuestion = question;
  if (!question) {
    questionTitle.textContent = quizFinished ? t("team.quizFinished") : t("team.waitingNext");
    optionsEl.innerHTML = "";
    mediaEl.innerHTML = "";
    answerInput.style.display = "block";
    return;
  }
  const answerType = question.answerType || question.type;
  questionTitle.textContent = t("team.questionTypeLabel", { type: answerType, text: question.questionText });
  renderMedia(question);

  if (answerType === "multiple-choice" || answerType === "true-false") {
    answerInput.style.display = "none";
    optionsEl.innerHTML = "";
    (question.options || []).forEach((opt) => {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option-btn";
      btn.textContent = opt;
      if (selectedOptions.indexOf(opt) >= 0) {
        btn.classList.add("selected");
      }
      btn.addEventListener("click", function () {
        if (answerType === "true-false") {
          selectedOptions = [opt];
        } else {
          var idx = selectedOptions.indexOf(opt);
          if (idx >= 0) {
            selectedOptions.splice(idx, 1);
          } else {
            selectedOptions.push(opt);
          }
        }
        optionsEl.querySelectorAll(".option-btn").forEach(function (b) {
          if (selectedOptions.indexOf(b.textContent) >= 0) {
            b.classList.add("selected");
          } else {
            b.classList.remove("selected");
          }
        });
      });
      optionsEl.appendChild(btn);
    });
  } else {
    optionsEl.innerHTML = "";
    answerInput.style.display = "block";
  }
}

function renderHeader() {
  headerEl.textContent = t("team.headerLine", {
    team: teamName || t("team.notAvailable"),
    question: currentQuestionIndex >= 0 ? currentQuestionIndex + 1 : t("team.notAvailable"),
    started: quizStarted ? t("common.yes") : t("common.no"),
    finished: quizFinished ? t("common.yes") : t("common.no"),
    approved: approved ? t("common.yes") : t("common.pending")
  });
  const disableActions = !approved || currentQuestionIndex < 0 || quizFinished || hasSubmittedCurrentQuestion;
  submitBtn.disabled = disableActions;
  skipBtn.disabled = disableActions;
  renderTimerStatus();
}

function showQuiz() {
  registerCard.style.display = "none";
  quizCard.style.display = "block";
}

function applySession(session) {
  if (!session) return;
  score = session.score || 0;
  approved = Boolean(session.approved);
  hasSubmittedCurrentQuestion = Boolean(session.hasSubmittedCurrentQuestion);
  quizStarted = Boolean(session.quizStarted);
  quizFinished = Boolean(session.quizFinished);
  if (quizFinished) {
    redirectToResults();
    return;
  }
  const nextQuestionIndex = Number(session.currentQuestionIndex ?? -1);
  const isNewQuestion = nextQuestionIndex !== currentQuestionIndex;
  currentQuestionIndex = nextQuestionIndex;
  if (isNewQuestion) {
    selectedOptions = [];
    answerInput.value = "";
    hasSubmittedCurrentQuestion = false;
  }
  renderQuestion(session.currentQuestion || null);
  renderHeader();
}

function registerTeam(forceTeamName, options) {
  const opts = options || {};
  const name = (forceTeamName || teamNameInput.value || "").trim();
  if (!name) {
    setMessage(t("team.teamNameRequired"));
    return;
  }
  const resetExisting = Boolean(opts.allowReset && resetPreviousTeamCheckbox && resetPreviousTeamCheckbox.checked);
  if (resetExisting) {
    const ok = window.confirm(t("team.resetPreviousConfirm"));
    if (!ok) return;
  }
  socket.emit("team:register", {
    teamId: resetExisting ? "" : teamId,
    teamName: name,
    resetExisting
  });
}

joinBtn.addEventListener("click", () => {
  registerTeam(null, { allowReset: true });
});

submitBtn.addEventListener("click", () => {
  if (!teamId || currentQuestionIndex < 0) return;
  var outgoingAnswers = answerInput.value;
  const answerType = currentQuestion ? currentQuestion.answerType || currentQuestion.type : "";
  if (currentQuestion && (answerType === "multiple-choice" || answerType === "true-false")) {
    outgoingAnswers = selectedOptions;
    if (!selectedOptions.length) {
      setMessage(t("team.chooseOption"));
      return;
    }
  }
  socket.emit("answer:submit", {
    teamId,
    questionIndex: currentQuestionIndex,
    answers: outgoingAnswers
  });
  setMessage(t("team.answerSubmitted"));
});

skipBtn.addEventListener("click", () => {
  if (!teamId || currentQuestionIndex < 0) return;
  const ok = window.confirm(t("team.skipConfirm"));
  if (!ok) return;
  socket.emit("answer:submit", {
    teamId,
    questionIndex: currentQuestionIndex,
    answers: []
  });
  selectedOptions = [];
  answerInput.value = "";
  optionsEl.querySelectorAll(".option-btn").forEach(function (b) {
    b.classList.remove("selected");
  });
  setMessage(t("team.questionSkipped"));
});

socket.on("connect", () => {
  if (teamId && teamName) {
    registerTeam(teamName, { allowReset: false });
  }
});

socket.on("team:registered", (payload) => {
  teamId = payload.teamId;
  teamName = payload.team.name;
  localStorage.setItem("quiz_team_id", teamId);
  localStorage.setItem("quiz_team_name", teamName);
  if (resetPreviousTeamCheckbox) {
    resetPreviousTeamCheckbox.checked = false;
  }
  showQuiz();
  applySession(payload.session);
  if (payload.resetCount > 0) {
    setMessage(t("team.resetDone", { count: payload.resetCount }));
  } else if (payload.approved) {
    setMessage(t("team.connected"));
  } else {
    setMessage(t("team.waitingApproval"));
  }
});

socket.on("team:session", (session) => {
  applySession(session);
});

socket.on("quiz:state", (data) => {
  quizStarted = Boolean(data.quizStarted);
  quizFinished = Boolean(data.quizFinished);
  const nextQuestionIndex = Number(data.currentQuestionIndex ?? -1);
  const isNewQuestion = nextQuestionIndex !== currentQuestionIndex;
  currentQuestionIndex = nextQuestionIndex;
  if (isNewQuestion) {
    selectedOptions = [];
    answerInput.value = "";
    hasSubmittedCurrentQuestion = false;
  }
  renderQuestion(data.currentQuestion || null);
  renderHeader();
});

socket.on("question:change", (data) => {
  const nextQuestionIndex = Number(data.index);
  const isNewQuestion = nextQuestionIndex !== currentQuestionIndex;
  currentQuestionIndex = nextQuestionIndex;
  if (isNewQuestion) {
    selectedOptions = [];
    answerInput.value = "";
    hasSubmittedCurrentQuestion = false;
  }
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
  redirectToResults();
});

socket.on("team:error", ({ message }) => {
  setMessage(message || t("common.unknownError"));
});

socket.on("timer:update", (payload) => {
  timerState = {
    active: Boolean(payload && payload.active),
    remainingSec: Number((payload && payload.remainingSec) || 0)
  };
  renderTimerStatus();
});

socket.on("team:approved", () => {
  approved = true;
  renderHeader();
  setMessage(t("team.approvedNotice"));
});

socket.on("team:kicked", () => {
  localStorage.removeItem("quiz_team_id");
  localStorage.removeItem("quiz_team_name");
  teamId = "";
  teamName = "";
  currentQuestion = null;
  currentQuestionIndex = -1;
  selectedOptions = [];
  hasSubmittedCurrentQuestion = false;
  answerInput.value = "";
  optionsEl.innerHTML = "";
  renderQuestion(null);
  registerCard.style.display = "block";
  quizCard.style.display = "none";
  setMessage(t("team.kickedNotice"));
});

socket.on("team:disqualified", () => {
  localStorage.removeItem("quiz_team_id");
  localStorage.removeItem("quiz_team_name");
  teamId = "";
  teamName = "";
  currentQuestion = null;
  currentQuestionIndex = -1;
  selectedOptions = [];
  hasSubmittedCurrentQuestion = false;
  answerInput.value = "";
  optionsEl.innerHTML = "";
  renderQuestion(null);
  registerCard.style.display = "block";
  quizCard.style.display = "none";
  setMessage(t("team.disqualifiedNotice"));
});

window.I18N.init().then(() => {
  window.I18N.bindLanguageSelector("langSelect", () => {
    window.I18N.applyToDocument(document);
    document.title = t("team.title");
    renderQuestion(currentQuestion);
    renderHeader();
  });
  window.I18N.applyToDocument(document);
  document.title = t("team.title");

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
});
