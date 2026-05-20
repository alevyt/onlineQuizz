(function () {
  var teamNameEl = document.getElementById("teamName");
  var teamScoreEl = document.getElementById("teamScore");
  var teamPlacementEl = document.getElementById("teamPlacement");
  var statusEl = document.getElementById("status");
  var rowsEl = document.getElementById("rows");
  var latestPayload = null;

  var quizSessionId = QuizSession.getSessionIdFromPath();
  if (!quizSessionId) {
    window.location.assign("/admin");
    return;
  }
  var params = new URLSearchParams(window.location.search);
  var teamId = params.get("teamId") || localStorage.getItem("quiz_team_id") || "";
  if (localStorage.getItem("quiz_session_id") !== quizSessionId) {
    teamId = params.get("teamId") || "";
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function t(key, params, fallback) {
    return window.I18N ? window.I18N.t(key, params, fallback) : fallback || key;
  }

  function renderLeaderboard(rows, currentTeamId) {
    rowsEl.innerHTML = "";
    (rows || []).forEach(function (item, index) {
      var tr = document.createElement("tr");
      if (item.id === currentTeamId) tr.className = "highlight";
      tr.innerHTML = "<td>" + (index + 1) + "</td><td>" + item.name + "</td><td>" + item.score + "</td>";
      rowsEl.appendChild(tr);
    });
  }

  function renderFromPayload(data) {
    if (!data) return;
    latestPayload = data;
    teamNameEl.textContent = data.team && data.team.name ? data.team.name : t("results.teamUnknown");
    teamScoreEl.textContent = String(data.score || 0);
    teamPlacementEl.textContent = data.placement ? String(data.placement) : "-";
    renderLeaderboard(data.leaderboard || [], teamId);
    if (!data.quizFinished) {
      setStatus(t("results.quizRunning"));
    } else {
      setStatus(t("results.quizFinished"));
    }
  }

  if (!teamId) {
    setStatus(t("results.teamIdentityMissing"));
    return;
  }

  fetch(QuizSession.apiBase() + "/results/" + encodeURIComponent(teamId))
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      renderFromPayload(data);
    })
    .catch(function () {
      setStatus(t("results.loadFailed"));
    });

  window.I18N.init().then(function () {
    window.I18N.bindLanguageSelector("langSelect", function () {
      window.I18N.applyToDocument(document);
      document.title = t("results.title");
      if (latestPayload) {
        renderFromPayload(latestPayload);
      } else if (!teamId) {
        setStatus(t("results.teamIdentityMissing"));
      }
    });
    window.I18N.applyToDocument(document);
    document.title = t("results.title");
    if (!teamId) {
      setStatus(t("results.teamIdentityMissing"));
    }
  });
})();

