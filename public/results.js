(function () {
  var teamNameEl = document.getElementById("teamName");
  var teamScoreEl = document.getElementById("teamScore");
  var teamPlacementEl = document.getElementById("teamPlacement");
  var statusEl = document.getElementById("status");
  var rowsEl = document.getElementById("rows");

  var params = new URLSearchParams(window.location.search);
  var teamId = params.get("teamId") || localStorage.getItem("quiz_team_id") || "";

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
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

  if (!teamId) {
    setStatus("Team identity not found. Open the Team page first.");
    return;
  }

  fetch("/api/results/" + encodeURIComponent(teamId))
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      teamNameEl.textContent = data.team && data.team.name ? data.team.name : "Unknown";
      teamScoreEl.textContent = String(data.score || 0);
      teamPlacementEl.textContent = data.placement ? String(data.placement) : "-";
      renderLeaderboard(data.leaderboard || [], teamId);
      if (!data.quizFinished) {
        setStatus("Quiz is still running. Results may update later.");
      } else {
        setStatus("Quiz finished.");
      }
    })
    .catch(function () {
      setStatus("Failed to load results.");
    });
})();

