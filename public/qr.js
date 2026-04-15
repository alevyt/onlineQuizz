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
  function t(key, params, fallback) {
    return window.I18N ? window.I18N.t(key, params, fallback) : fallback || key;
  }

  function renderTexts() {
    if (window.I18N) window.I18N.applyToDocument(document);
    document.title = t("qr.title");
    qrImage.setAttribute("alt", t("qr.imageAlt"));
    if (linkEl) linkEl.textContent = teamLink;
  }

  renderTexts();
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
      if (linkEl) linkEl.textContent = t("qr.failed", { link: teamLink });
    });

  qrImage.addEventListener("click", function () {
    qrImage.classList.toggle("qr-fullscreen");
  });

  window.I18N.init().then(function () {
    window.I18N.bindLanguageSelector("langSelect", function () {
      renderTexts();
    });
    renderTexts();
  });
})();

