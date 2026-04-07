const socket = io("/leaderboard");
const rowsEl = document.getElementById("rows");

function render(rows) {
  rowsEl.innerHTML = "";
  rows.forEach((item, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${idx + 1}</td><td>${item.name}</td><td>${item.score}</td>`;
    rowsEl.appendChild(tr);
  });
}

socket.on("leaderboard:update", (rows) => {
  render(rows || []);
});
