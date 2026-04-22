var express = require("express");
var http = require("http");
var path = require("path");
var os = require("os");
var fs = require("fs");
var crypto = require("crypto");
var multer = require("multer");
var socketIo = require("socket.io");
var QRCode = require("qrcode");

var attachSocketHandlers = require("./socketHandler");
var quiz = require("./quizController");
var parseExcelFile = require("../utils/parseExcel").parseExcelFile;
var parseCsvFile = require("../utils/parseCsv").parseCsvFile;

var app = express();
var server = http.createServer(app);
var io = socketIo(server);
var ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "").trim();
if (!ADMIN_PASSWORD) {
  ADMIN_PASSWORD = "admin";
}
var ADMIN_COOKIE_NAME = "admin_auth";
var ADMIN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 12;
var ADMIN_AUTH_TOKEN = crypto
  .createHash("sha256")
  .update("online-quizz-admin:" + ADMIN_PASSWORD)
  .digest("hex");

var uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function clearUploadsDir() {
  if (!fs.existsSync(uploadsDir)) return;
  var files = fs.readdirSync(uploadsDir);
  files.forEach(function (name) {
    var filePath = path.join(uploadsDir, name);
    try {
      var stat = fs.statSync(filePath);
      if (stat.isFile()) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      // Ignore cleanup errors to avoid startup failures.
    }
  });
}

clearUploadsDir();

var upload = multer({ dest: uploadsDir });

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

function parseCookies(req) {
  var header = req.headers.cookie || "";
  if (!header) return {};
  return header.split(";").reduce(function (acc, part) {
    var trimmed = part.trim();
    if (!trimmed) return acc;
    var eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) return acc;
    var key = trimmed.slice(0, eqIndex);
    var value = trimmed.slice(eqIndex + 1);
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function isAdminAuthenticated(req) {
  var cookies = parseCookies(req);
  return cookies[ADMIN_COOKIE_NAME] === ADMIN_AUTH_TOKEN;
}

function requireAdminAuth(req, res, next) {
  if (isAdminAuthenticated(req)) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

app.get("/admin", function (req, res) {
  if (!isAdminAuthenticated(req)) {
    return res.redirect("/admin-login");
  }
  res.sendFile(path.join(__dirname, "..", "public", "admin.html"));
});

app.get("/admin-login", function (req, res) {
  if (isAdminAuthenticated(req)) {
    return res.redirect("/admin");
  }
  return res.sendFile(path.join(__dirname, "..", "public", "admin-login.html"));
});

app.post("/api/admin/login", function (req, res) {
  var password = String((req.body && req.body.password) || "").trim();
  if (!password || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid password." });
  }
  var cookieParts = [
    ADMIN_COOKIE_NAME + "=" + encodeURIComponent(ADMIN_AUTH_TOKEN),
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=" + ADMIN_COOKIE_MAX_AGE_SECONDS
  ];
  res.setHeader("Set-Cookie", cookieParts.join("; "));
  return res.json({ ok: true });
});

app.post("/api/admin/logout", function (req, res) {
  var cookieParts = [
    ADMIN_COOKIE_NAME + "=",
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0"
  ];
  res.setHeader("Set-Cookie", cookieParts.join("; "));
  return res.json({ ok: true });
});

app.use(function (req, res, next) {
  if (
    req.path === "/admin" ||
    req.path === "/admin-login" ||
    req.path === "/team" ||
    req.path === "/leaderboard" ||
    req.path === "/qr" ||
    req.path === "/results"
  ) {
    return next();
  }
  if (req.path.indexOf("/api/") === 0) return next();
  if (req.path.indexOf("/socket.io/") === 0) return next();
  if (path.extname(req.path)) return next();
  return res.redirect("/team");
});

app.get("/team", function (req, res) {
  res.sendFile(path.join(__dirname, "..", "public", "team.html"));
});

app.get("/leaderboard", function (req, res) {
  res.sendFile(path.join(__dirname, "..", "public", "leaderboard.html"));
});

app.get("/qr", function (req, res) {
  res.sendFile(path.join(__dirname, "..", "public", "qr.html"));
});

app.get("/results", function (req, res) {
  res.sendFile(path.join(__dirname, "..", "public", "results.html"));
});

app.get("/api/session/admin", function (req, res) {
  if (!isAdminAuthenticated(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.json({
    session: quiz.getSessionForAdmin(),
    leaderboard: quiz.getLeaderboard(),
    submissions: quiz.getSubmissionsView()
  });
});

app.get("/api/session/team/:teamId", function (req, res) {
  res.json(quiz.getSessionForTeam(req.params.teamId));
});

app.get("/api/results/:teamId", function (req, res) {
  var teamId = req.params.teamId;
  var session = quiz.getSessionForTeam(teamId);
  var leaderboard = quiz.getLeaderboard();
  var placement = null;
  for (var i = 0; i < leaderboard.length; i += 1) {
    if (leaderboard[i].id === teamId) {
      placement = i + 1;
      break;
    }
  }
  res.json({
    quizFinished: Boolean(session.quizFinished),
    team: session.team || null,
    score: session.score || 0,
    placement: placement,
    leaderboard: leaderboard
  });
});

app.get("/api/qr", function (req, res) {
  var text = String(req.query.text || "").trim();
  if (!text) {
    return res.status(400).json({ error: "text query param is required." });
  }
  QRCode.toDataURL(text, { width: 256, margin: 1 }, function (err, dataUrl) {
    if (err) {
      return res.status(500).json({ error: "Failed to generate QR code." });
    }
    return res.json({ dataUrl: dataUrl });
  });
});

app.post("/api/upload", requireAdminAuth, upload.single("quizFile"), function (req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "quizFile is required." });
  }
  var originalName = (req.file.originalname || "").toLowerCase();
  var ext = path.extname(originalName);
  var isCsv = ext === ".csv" || originalName.indexOf(".csv") !== -1;

  var parsed = isCsv ? parseCsvFile(req.file.path) : parseExcelFile(req.file.path);
  try {
    fs.unlinkSync(req.file.path);
  } catch (error) {
    // Ignore deletion errors for temp uploads.
  }
  var errors = parsed.errors;
  var questions = parsed.questions;
  if (errors.length) {
    return res.status(400).json({ errors });
  }

  var session = quiz.setQuestions(questions);
  io.of("/admin").emit("session:restored", {
    session,
    leaderboard: quiz.getLeaderboard(),
    submissions: quiz.getSubmissionsView()
  });
  io.of("/team").emit("session:restored");
  io.of("/leaderboard").emit("leaderboard:update", quiz.getLeaderboard());

  return res.json({ ok: true, count: questions.length });
});

attachSocketHandlers(io, function (cookieHeader) {
  if (!cookieHeader) return false;
  var cookies = cookieHeader.split(";").reduce(function (acc, part) {
    var trimmed = part.trim();
    if (!trimmed) return acc;
    var eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) return acc;
    acc[trimmed.slice(0, eqIndex)] = decodeURIComponent(trimmed.slice(eqIndex + 1));
    return acc;
  }, {});
  return cookies[ADMIN_COOKIE_NAME] === ADMIN_AUTH_TOKEN;
});

function getLocalIPv4() {
  var interfaces = os.networkInterfaces();
  var keys = Object.keys(interfaces);
  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i];
    var list = interfaces[key] || [];
    for (var j = 0; j < list.length; j += 1) {
      var info = list[j];
      if (info.family === "IPv4" && !info.internal) {
        return info.address;
      }
    }
  }
  return "127.0.0.1";
}

var PORT = 3000;
server.listen(PORT, "0.0.0.0", function () {
  var localIp = getLocalIPv4();
  console.log("Server running on: http://localhost:" + PORT);
  console.log("Network URL: http://" + localIp + ":" + PORT);
  console.log("Team URL: http://" + localIp + ":" + PORT + "/team");
});
