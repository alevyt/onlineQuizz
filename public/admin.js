const socket = io("/admin");

let session = null;
let leaderboard = [];
let submissions = [];
let teams = [];
let submissionsQuestionPageIndex = 0;

const uploadForm = document.getElementById("uploadForm");
const quizFile = document.getElementById("quizFile");
const statusEl = document.getElementById("status");
const allSubmittedNoticeEl = document.getElementById("allSubmittedNotice");
const questionsBody = document.querySelector("#questionsTable tbody");
const teamsBody = document.querySelector("#teamsTable tbody");
const submissionsBody = document.querySelector("#submissionsTable tbody");
const submissionsPrevBtn = document.getElementById("submissionsPrevBtn");
const submissionsNextBtn = document.getElementById("submissionsNextBtn");
const submissionsPageLabel = document.getElementById("submissionsPageLabel");

const startBtn = document.getElementById("startBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const finishBtn = document.getElementById("finishBtn");
const clearBtn = document.getElementById("clearBtn");
const clearTeamsBtn = document.getElementById("clearTeamsBtn");

function t(key, params, fallback) {
  return window.I18N ? window.I18N.t(key, params, fallback) : fallback || key;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function updateAllSubmittedNotice() {
  if (!session || session.currentQuestionIndex < 0 || session.quizFinished) {
    allSubmittedNoticeEl.textContent = "";
    return;
  }
  const approvedTeams = teams.filter((team) => Boolean(team && team.approved));
  if (!approvedTeams.length) {
    allSubmittedNoticeEl.textContent = "";
    return;
  }
  const submittedByTeam = new Set(
    submissions.filter((row) => row.questionIndex === session.currentQuestionIndex).map((row) => row.teamId)
  );
  const allSubmitted = approvedTeams.every((team) => submittedByTeam.has(team.id));
  if (!allSubmitted) {
    allSubmittedNoticeEl.textContent = "";
    return;
  }
  allSubmittedNoticeEl.textContent = t("admin.allTeamsSubmitted", { current: session.currentQuestionIndex + 1 });
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
      `${approved ? "-" : `<button data-approve="${team.id}">${t("admin.approve")}</button>`} <button data-kick="${team.id}">${t("admin.kick")}</button>`
    }</td>`;
    teamsBody.appendChild(tr);
  });
  teamsBody.querySelectorAll("button[data-approve]").forEach((btn) => {
    btn.addEventListener("click", () => {
      socket.emit("team:approve", { teamId: btn.getAttribute("data-approve") });
    });
  });
  teamsBody.querySelectorAll("button[data-kick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const teamId = btn.getAttribute("data-kick");
      const ok = window.confirm(t("admin.kickConfirm"));
      if (!ok) return;
      socket.emit("team:kick", { teamId });
      setStatus(t("admin.teamKicked"));
    });
  });
}

function renderSubmissions() {
  const questionsCount = (session && session.questions ? session.questions.length : 0);
  const maxIndex = Math.max(questionsCount - 1, 0);
  if (submissionsQuestionPageIndex < 0) submissionsQuestionPageIndex = 0;
  if (submissionsQuestionPageIndex > maxIndex) submissionsQuestionPageIndex = maxIndex;
  submissionsPageLabel.textContent = questionsCount
    ? t("admin.submissionsPageLabel", {
        current: submissionsQuestionPageIndex + 1,
        total: questionsCount
      })
    : t("admin.noCurrentQuestion");
  submissionsPrevBtn.disabled = !questionsCount || submissionsQuestionPageIndex <= 0;
  submissionsNextBtn.disabled = !questionsCount || submissionsQuestionPageIndex >= maxIndex;

  submissionsBody.innerHTML = "";
  submissions
    .filter((row) => row.questionIndex === submissionsQuestionPageIndex)
    .forEach((row) => {
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
  updateAllSubmittedNotice();
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
clearTeamsBtn.addEventListener("click", () => {
  const ok = window.confirm(t("admin.clearTeamsConfirm"));
  if (!ok) return;
  socket.emit("teams:clear");
  setStatus(t("admin.teamsCleared"));
});

submissionsPrevBtn.addEventListener("click", () => {
  submissionsQuestionPageIndex = Math.max(0, submissionsQuestionPageIndex - 1);
  renderSubmissions();
});

submissionsNextBtn.addEventListener("click", () => {
  const questionsCount = (session && session.questions ? session.questions.length : 0);
  const maxIndex = Math.max(questionsCount - 1, 0);
  submissionsQuestionPageIndex = Math.min(maxIndex, submissionsQuestionPageIndex + 1);
  renderSubmissions();
});

socket.on("session:restored", (payload) => {
  session = payload.session;
  leaderboard = payload.leaderboard || [];
  submissions = payload.submissions || [];
  teams = Object.values(payload.session.teams || {});
  if (session && session.currentQuestionIndex >= 0) {
    submissionsQuestionPageIndex = session.currentQuestionIndex;
  }
  renderAll();
});

socket.on("teams:update", (rows) => {
  teams = rows || [];
  renderTeams();
  updateAllSubmittedNotice();
});
socket.on("submissions:update", (rows) => {
  submissions = rows || [];
  renderSubmissions();
  updateAllSubmittedNotice();
});

window.I18N.init().then(() => {
  window.I18N.bindLanguageSelector("langSelect", () => {
    renderAll();
  });
  fetch("/api/session/admin")
    .then(async (r) => {
      if (r.status === 401) {
        window.location.assign("/admin-login");
        return null;
      }
      return r.json();
    })
    .then((data) => {
      if (!data) return;
      session = data.session;
      leaderboard = data.leaderboard || [];
      submissions = data.submissions || [];
      teams = Object.values(data.session.teams || {});
      if (session && session.currentQuestionIndex >= 0) {
        submissionsQuestionPageIndex = session.currentQuestionIndex;
      }
      renderAll();
    });
});
