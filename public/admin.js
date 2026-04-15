const socket = io("/admin");

let session = null;
let leaderboard = [];
let submissions = [];
let teams = [];

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
const clearBtn = document.getElementById("clearBtn");

function t(key, params, fallback) {
  return window.I18N ? window.I18N.t(key, params, fallback) : fallback || key;
}

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
  const scoreMap = {};
  leaderboard.forEach((item) => {
    scoreMap[item.id] = item.score;
  });
  teams.forEach((team) => {
    const tr = document.createElement("tr");
    const approved = Boolean(team.approved);
    const score = scoreMap[team.id] || 0;
    tr.innerHTML = `<td>${team.name}</td><td>${approved ? t("common.approved") : t("common.pending")}</td><td>${score}</td><td>${
      approved ? "-" : `<button data-approve="${team.id}">${t("admin.approve")}</button>`
    }</td>`;
    teamsBody.appendChild(tr);
  });
  teamsBody.querySelectorAll("button[data-approve]").forEach((btn) => {
    btn.addEventListener("click", () => {
      socket.emit("team:approve", { teamId: btn.getAttribute("data-approve") });
    });
  });
}

function renderSubmissions() {
  submissionsBody.innerHTML = "";
  submissions.forEach((row) => {
    const tr = document.createElement("tr");
    const inputId = `a_${row.teamId}_${row.questionIndex}`;
    const markId = `m_${row.teamId}_${row.questionIndex}`;
    const selectedAuto = row.manualIsCorrect === null ? "selected" : "";
    const selectedTrue = row.manualIsCorrect === true ? "selected" : "";
    const selectedFalse = row.manualIsCorrect === false ? "selected" : "";
    const autoLabel = t("admin.autoMark", {
      result: row.isCorrect ? t("common.correct").toLowerCase() : t("common.incorrect").toLowerCase()
    });
    tr.innerHTML = `
      <td>${row.teamName}</td>
      <td>${row.questionIndex + 1}</td>
      <td><input id="${inputId}" type="text" value="${(row.answers || []).join("; ")}" /></td>
      <td>
        <select id="${markId}">
          <option value="auto" ${selectedAuto}>${autoLabel}</option>
          <option value="true" ${selectedTrue}>${t("common.correct")}</option>
          <option value="false" ${selectedFalse}>${t("common.incorrect")}</option>
        </select>
      </td>
      <td><button data-team="${row.teamId}" data-q="${row.questionIndex}" data-input="${inputId}" data-mark="${markId}">${t("common.save")}</button></td>
    `;
    submissionsBody.appendChild(tr);
  });

  submissionsBody.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const teamId = btn.getAttribute("data-team");
      const q = Number(btn.getAttribute("data-q"));
      const input = document.getElementById(btn.getAttribute("data-input"));
      const markSelect = document.getElementById(btn.getAttribute("data-mark"));
      const markValue = markSelect ? markSelect.value : "auto";
      const isCorrect = markValue === "auto" ? null : markValue === "true";
      socket.emit("answer:edit", {
        teamId,
        questionIndex: q,
        answers: input.value,
        isCorrect
      });
    });
  });
}

function renderAll() {
  if (window.I18N) window.I18N.applyToDocument(document);
  document.title = t("admin.title");
  renderQuestions();
  renderTeams();
  renderSubmissions();
  if (session) {
    setStatus(
      t("admin.stateLine", {
        started: session.quizStarted ? t("common.yes") : t("common.no"),
        finished: session.quizFinished ? t("common.yes") : t("common.no"),
        current: session.currentQuestionIndex >= 0 ? session.currentQuestionIndex + 1 : t("admin.noCurrentQuestion")
      })
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
    setStatus((data.errors || [data.error || t("admin.uploadFailed")]).join(" | "));
    return;
  }
  setStatus(t("admin.uploadComplete", { count: data.count }));
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
clearBtn.addEventListener("click", () => {
  const ok = window.confirm(t("admin.clearConfirm"));
  if (!ok) return;
  socket.emit("quiz:clear");
  setStatus(t("admin.cleared"));
});

socket.on("session:restored", (payload) => {
  session = payload.session;
  leaderboard = payload.leaderboard || [];
  submissions = payload.submissions || [];
  teams = Object.values(payload.session.teams || {});
  renderAll();
});

socket.on("teams:update", (rows) => {
  teams = rows || [];
  renderTeams();
});
socket.on("submissions:update", (rows) => {
  submissions = rows || [];
  renderSubmissions();
});

window.I18N.init().then(() => {
  window.I18N.bindLanguageSelector("langSelect", () => {
    renderAll();
  });
  fetch("/api/session/admin")
    .then((r) => r.json())
    .then((data) => {
      session = data.session;
      leaderboard = data.leaderboard || [];
      submissions = data.submissions || [];
      teams = Object.values(data.session.teams || {});
      renderAll();
    });
});
