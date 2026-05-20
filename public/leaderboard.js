const quizSessionId = QuizSession.getSessionIdFromPath();
if (!quizSessionId) {
  window.location.assign("/admin");
}
const socket = QuizSession.connectSocket("/leaderboard");
const rowsEl = document.getElementById("rows");
let latestRows = [];

function render(rows) {
  latestRows = rows || [];
  rowsEl.innerHTML = "";
  latestRows.forEach((item, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${idx + 1}</td><td>${item.name}</td><td>${item.score}</td>`;
    rowsEl.appendChild(tr);
  });
}

socket.on("leaderboard:update", (rows) => {
  render(rows || []);
});

window.I18N.init().then(() => {
  window.I18N.bindLanguageSelector("langSelect", () => {
    window.I18N.applyToDocument(document);
    document.title = window.I18N.t("leaderboard.title");
    render(latestRows);
  });
  window.I18N.applyToDocument(document);
  document.title = window.I18N.t("leaderboard.title");
});
