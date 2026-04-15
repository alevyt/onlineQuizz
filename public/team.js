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
let approved = false;
let selectedOptions = [];

if (teamName) {
  teamNameInput.value = teamName;
}

if (urlTeamId) {
  localStorage.setItem("quiz_team_id", urlTeamId);
}

function setMessage(text) {
  msgEl.textContent = text;
}

function redirectToResults() {
  if (!teamId) return;
  window.location.href = "/results?teamId=" + encodeURIComponent(teamId);
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
  selectedOptions = [];
  answerInput.value = "";
  if (!question) {
    questionTitle.textContent = quizFinished ? "Quiz finished." : "Waiting for next question...";
    optionsEl.innerHTML = "";
    mediaEl.innerHTML = "";
    answerInput.style.display = "block";
    return;
  }
  questionTitle.textContent = `${question.type}: ${question.questionText}`;
  renderMedia(question);

  if (question.type === "multiple-choice" || question.type === "true-false") {
    answerInput.style.display = "none";
    optionsEl.innerHTML = "";
    (question.options || []).forEach((opt) => {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "option-btn";
      btn.textContent = opt;
      btn.addEventListener("click", function () {
        if (question.type === "true-false") {
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
  headerEl.textContent = `Team: ${teamName || "-"} | Score: ${score} | Question: ${
    currentQuestionIndex >= 0 ? currentQuestionIndex + 1 : "-"
  } | Started: ${quizStarted ? "yes" : "no"} | Finished: ${quizFinished ? "yes" : "no"} | Approved: ${
    approved ? "yes" : "pending"
  }`;
  submitBtn.disabled = !approved;
}

function showQuiz() {
  registerCard.style.display = "none";
  quizCard.style.display = "block";
}

function applySession(session) {
  if (!session) return;
  score = session.score || 0;
  approved = Boolean(session.approved);
  quizStarted = Boolean(session.quizStarted);
  quizFinished = Boolean(session.quizFinished);
  if (quizFinished) {
    redirectToResults();
    return;
  }
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
  var outgoingAnswers = answerInput.value;
  if (currentQuestion && (currentQuestion.type === "multiple-choice" || currentQuestion.type === "true-false")) {
    outgoingAnswers = selectedOptions;
    if (!selectedOptions.length) {
      setMessage("Please choose at least one option.");
      return;
    }
  }
  socket.emit("answer:submit", {
    teamId,
    questionIndex: currentQuestionIndex,
    answers: outgoingAnswers
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
  if (payload.approved) {
    setMessage("Connected.");
  } else {
    setMessage("Connected. Waiting for admin approval.");
  }
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
  redirectToResults();
});

socket.on("team:error", ({ message }) => {
  setMessage(message || "Unknown error");
});

socket.on("team:approved", () => {
  approved = true;
  renderHeader();
  setMessage("Approved by admin. You can submit answers now.");
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
