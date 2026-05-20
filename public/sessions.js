const sessionsBody = document.getElementById("sessionsBody");
const statusEl = document.getElementById("status");
const createSessionBtn = document.getElementById("createSessionBtn");
const logoutBtn = document.getElementById("logoutBtn");

let sessions = [];

function t(key, params, fallback) {
  return window.I18N ? window.I18N.t(key, params, fallback) : fallback || key;
}

function setStatus(text) {
  statusEl.textContent = text || "";
}

function sessionStatusLabel(item) {
  if (item.quizFinished) return t("sessions.statusFinished");
  if (item.quizStarted) return t("sessions.statusRunning");
  if (item.questionCount > 0) return t("sessions.statusReady");
  return t("sessions.statusEmpty");
}

function renderSessions() {
  sessionsBody.innerHTML = "";
  if (!sessions.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="muted">${t("sessions.empty")}</td>`;
    sessionsBody.appendChild(tr);
    return;
  }
  sessions.forEach((item) => {
    const tr = document.createElement("tr");
    const adminPath = "/s/" + encodeURIComponent(item.id) + "/admin";
    const teamPath = "/s/" + encodeURIComponent(item.id) + "/team";
    const leaderboardPath = "/s/" + encodeURIComponent(item.id) + "/leaderboard";
    tr.innerHTML = `
      <td><code>${item.id}</code></td>
      <td>${item.questionCount}</td>
      <td>${item.teamCount}</td>
      <td>${sessionStatusLabel(item)}</td>
      <td class="actions">
        <a class="btn" href="${adminPath}" data-i18n="sessions.openAdmin">Admin</a>
        <a class="btn" href="${teamPath}" data-i18n="sessions.openTeam">Team</a>
        <a class="btn" href="${leaderboardPath}" data-i18n="sessions.openLeaderboard">Leaderboard</a>
        <button type="button" data-delete="${item.id}" data-i18n="sessions.delete">Delete</button>
      </td>
    `;
    sessionsBody.appendChild(tr);
  });
  sessionsBody.querySelectorAll("button[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-delete");
      const ok = window.confirm(t("sessions.deleteConfirm", { id }));
      if (!ok) return;
      const res = await fetch("/api/sessions/" + encodeURIComponent(id), {
        method: "DELETE",
        credentials: "same-origin"
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus(data.error || t("sessions.deleteFailed"));
        return;
      }
      setStatus(t("sessions.deleted"));
      loadSessions();
    });
  });
  if (window.I18N) window.I18N.applyToDocument(sessionsBody);
}

async function loadSessions() {
  const res = await fetch("/api/sessions", { credentials: "same-origin" });
  if (res.status === 401) {
    window.location.assign("/admin-login?next=" + encodeURIComponent("/admin"));
    return;
  }
  const data = await res.json();
  sessions = data.sessions || [];
  renderSessions();
}

createSessionBtn.addEventListener("click", async () => {
  const res = await fetch("/api/sessions", {
    method: "POST",
    credentials: "same-origin"
  });
  if (res.status === 401) {
    window.location.assign("/admin-login?next=" + encodeURIComponent("/admin"));
    return;
  }
  const data = await res.json();
  if (!res.ok || !data.urls || !data.urls.admin) {
    setStatus(t("sessions.createFailed"));
    return;
  }
  window.location.assign(data.urls.admin);
});

logoutBtn.addEventListener("click", async () => {
  await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
  window.location.assign("/admin-login");
});

window.I18N.init().then(() => {
  window.I18N.bindLanguageSelector("langSelect", () => {
    window.I18N.applyToDocument(document);
    document.title = t("sessions.title");
    renderSessions();
  });
  window.I18N.applyToDocument(document);
  document.title = t("sessions.title");
  loadSessions();
});
