(function () {
  var qrImage = document.getElementById("qrImage");
  var linkEl = document.getElementById("linkEl");

  var params = new URLSearchParams(window.location.search);
  var tid = params.get("teamId") || params.get("tid") || "";

  var teamLink = window.location.origin + "/team";
  if (tid) {
    teamLink += "?teamId=" + encodeURIComponent(tid);
  }

  if (!qrImage) return;
  if (linkEl) linkEl.textContent = teamLink;
  fetch("/api/qr?text=" + encodeURIComponent(teamLink))
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      if (!data || !data.dataUrl) throw new Error("Missing QR payload");
      qrImage.src = data.dataUrl;
    })
    .catch(function () {
      qrImage.style.display = "none";
      if (linkEl) linkEl.textContent = "Failed to generate QR. Link: " + teamLink;
    });

  qrImage.addEventListener("click", function () {
    qrImage.classList.toggle("qr-fullscreen");
  });
})();

