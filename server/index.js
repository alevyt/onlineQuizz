var express = require("express");
var http = require("http");
var path = require("path");
var os = require("os");
var fs = require("fs");
var multer = require("multer");
var socketIo = require("socket.io");

var attachSocketHandlers = require("./socketHandler");
var quiz = require("./quizController");
var parseExcelFile = require("../utils/parseExcel").parseExcelFile;
var parseCsvFile = require("../utils/parseCsv").parseCsvFile;

var app = express();
var server = http.createServer(app);
var io = socketIo(server);

var uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

var upload = multer({ dest: uploadsDir });

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/admin", function (req, res) {
  res.sendFile(path.join(__dirname, "..", "public", "admin.html"));
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

app.get("/api/session/admin", function (req, res) {
  res.json({
    session: quiz.getSessionForAdmin(),
    leaderboard: quiz.getLeaderboard(),
    submissions: quiz.getSubmissionsView()
  });
});

app.get("/api/session/team/:teamId", function (req, res) {
  res.json(quiz.getSessionForTeam(req.params.teamId));
});

app.post("/api/upload", upload.single("quizFile"), function (req, res) {
  if (!req.file) {
    return res.status(400).json({ error: "quizFile is required." });
  }
  var originalName = (req.file.originalname || "").toLowerCase();
  var ext = path.extname(originalName);
  var isCsv = ext === ".csv" || originalName.indexOf(".csv") !== -1;

  var parsed = isCsv ? parseCsvFile(req.file.path) : parseExcelFile(req.file.path);
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

attachSocketHandlers(io);

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
