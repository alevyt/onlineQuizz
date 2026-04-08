(function () {
  var canvas = document.getElementById("qrCanvas");
  var linkEl = document.getElementById("linkEl");

  var params = new URLSearchParams(window.location.search);
  var tid = params.get("teamId") || params.get("tid") || "";

  var teamLink = window.location.origin + "/team";
  if (tid) {
    teamLink += "?teamId=" + encodeURIComponent(tid);
  }

  if (!canvas) return;
  if (linkEl) linkEl.textContent = teamLink;

  if (!window.QRCode || !window.QRCode.toCanvas) {
    canvas.style.display = "none";
    if (linkEl) linkEl.textContent = "QR lib missing. Link: " + teamLink;
    return;
  }

  window.QRCode.toCanvas(canvas, teamLink, { width: 256, margin: 1 }, function (err) {
    if (err && linkEl) {
      linkEl.textContent = "Failed to generate QR. Link: " + teamLink;
    }
  });
})();

