(function (global) {
  var SESSION_PATH_RE = /^\/s\/([a-zA-Z0-9_-]{8,32})(?:\/|$)/;

  function getSessionIdFromPath() {
    var match = global.location.pathname.match(SESSION_PATH_RE);
    return match ? match[1] : null;
  }

  function sessionPath(subpath) {
    var sessionId = getSessionIdFromPath();
    var path = subpath || "";
    if (path.charAt(0) !== "/") path = "/" + path;
    if (!sessionId) return path;
    return "/s/" + encodeURIComponent(sessionId) + path;
  }

  function apiBase() {
    var sessionId = getSessionIdFromPath();
    if (!sessionId) return "/api";
    return "/api/sessions/" + encodeURIComponent(sessionId);
  }

  function connectSocket(namespace) {
    var sessionId = getSessionIdFromPath();
    if (!sessionId) {
      throw new Error("Missing quiz session id in URL.");
    }
    return global.io(namespace, { query: { sessionId: sessionId } });
  }

  global.QuizSession = {
    getSessionIdFromPath: getSessionIdFromPath,
    sessionPath: sessionPath,
    apiBase: apiBase,
    connectSocket: connectSocket
  };
})(window);
