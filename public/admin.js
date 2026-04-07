const socket = io("/admin");

let session = null;
let leaderboard = [];
let submissions = [];

const uploadForm = document.getElementById("uploadForm");
const quizFile = document.getElementById("quizFile");
const statusEl = document.getElementById("status");
const questionsBody = document.querySelector("#questionsTable tbody");
const teamsBody = document.querySelector("#teamsTable tbody");
const submissionsBody = document.querySelector("#submissionsTable tbody");

const startBtn = document.getElementById("startBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const finishBtn = document.getElementById("finishBtn");

function setStatus(text) {
  statusEl.textContent = text;
}

function renderQuestions() {
  const questions = session?.questions || [];
  questionsBody.innerHTML = "";
  questions.forEach((q, idx) => {
    const tr = document.createElement("tr");
    if (idx === session.currentQuestionIndex) tr.style.background = "#eef6ff";
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${q.type}</td>
      <td>${q.questionText}</td>
      <td>${(q.options || []).join("; ")}</td>
      <td>${(q.correctAnswers || []).join("; ")}</td>
      <td>${q.mediaURL || ""}</td>
    `;
    questionsBody.appendChild(tr);
  });
}

function renderTeams() {
  teamsBody.innerHTML = "";
  leaderboard.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${item.name}</td><td>${item.score}</td>`;
    teamsBody.appendChild(tr);
  });
}

function renderSubmissions() {
  submissionsBody.innerHTML = "";
  submissions.forEach((row) => {
    const tr = document.createElement("tr");
    const inputId = `a_${row.teamId}_${row.questionIndex}`;
    tr.innerHTML = `
      <td>${row.teamName}</td>
      <td>${row.questionIndex + 1}</td>
      <td><input id="${inputId}" type="text" value="${(row.answers || []).join("; ")}" /></td>
      <td>${row.isCorrect ? "yes" : "no"}</td>
      <td><button data-team="${row.teamId}" data-q="${row.questionIndex}" data-input="${inputId}">Save</button></td>
    `;
    submissionsBody.appendChild(tr);
  });

  submissionsBody.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const teamId = btn.getAttribute("data-team");
      const q = Number(btn.getAttribute("data-q"));
      const input = document.getElementById(btn.getAttribute("data-input"));
      socket.emit("answer:edit", {
        teamId,
        questionIndex: q,
        answers: input.value
      });
    });
  });
}

function renderAll() {
  renderQuestions();
  renderTeams();
  renderSubmissions();
  if (session) {
    setStatus(
      `Started: ${session.quizStarted ? "yes" : "no"} | Finished: ${session.quizFinished ? "yes" : "no"} | Current Question: ${
        session.currentQuestionIndex >= 0 ? session.currentQuestionIndex + 1 : "-"
      }`
    );
  }
}

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = quizFile.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append("quizFile", file);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok) {
    setStatus((data.errors || [data.error || "Upload failed"]).join(" | "));
    return;
  }
  setStatus(`Upload complete. Questions: ${data.count}`);
});

startBtn.addEventListener("click", () => socket.emit("quiz:start"));
finishBtn.addEventListener("click", () => socket.emit("quiz:finish"));
prevBtn.addEventListener("click", () => {
  if (!session) return;
  socket.emit("question:set", { index: Math.max(0, session.currentQuestionIndex - 1) });
});
nextBtn.addEventListener("click", () => {
  if (!session) return;
  const max = (session.questions || []).length - 1;
  socket.emit("question:set", { index: Math.min(max, session.currentQuestionIndex + 1) });
});

socket.on("session:restored", (payload) => {
  session = payload.session;
  leaderboard = payload.leaderboard || [];
  submissions = payload.submissions || [];
  renderAll();
});

socket.on("teams:update", () => {});
socket.on("submissions:update", (rows) => {
  submissions = rows || [];
  renderSubmissions();
});

fetch("/api/session/admin")
  .then((r) => r.json())
  .then((data) => {
    session = data.session;
    leaderboard = data.leaderboard || [];
    submissions = data.submissions || [];
    renderAll();
  });
