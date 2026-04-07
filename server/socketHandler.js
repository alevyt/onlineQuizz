const quiz = require("./quizController");

function broadcastState(io) {
  const adminSession = quiz.getSessionForAdmin();
  const leaderboard = quiz.getLeaderboard();
  const submissions = quiz.getSubmissionsView();
  io.of("/admin").emit("session:restored", {
    session: adminSession,
    leaderboard,
    submissions
  });
  io.of("/leaderboard").emit("leaderboard:update", leaderboard);
  io.of("/team").emit("quiz:state", {
    quizStarted: adminSession.quizStarted,
    quizFinished: adminSession.quizFinished,
    currentQuestionIndex: adminSession.currentQuestionIndex,
    currentQuestion: quiz.getPublicQuestion(quiz.getCurrentQuestion())
  });
  io.of("/admin").emit("teams:update", Object.values(quiz.getState().teams));
  io.of("/admin").emit("submissions:update", submissions);
}

function attachSocketHandlers(io) {
  const adminNs = io.of("/admin");
  const teamNs = io.of("/team");
  const leaderboardNs = io.of("/leaderboard");

  adminNs.on("connection", (socket) => {
    socket.emit("session:restored", {
      session: quiz.getSessionForAdmin(),
      leaderboard: quiz.getLeaderboard(),
      submissions: quiz.getSubmissionsView()
    });
    socket.emit("teams:update", Object.values(quiz.getState().teams));

    socket.on("quiz:start", () => {
      const ok = quiz.startQuiz();
      if (ok) {
        adminNs.emit("quiz:start");
        teamNs.emit("quiz:start");
        broadcastState(io);
      }
    });

    socket.on("quiz:finish", () => {
      quiz.finishQuiz();
      adminNs.emit("quiz:finish");
      teamNs.emit("quiz:finish");
      broadcastState(io);
    });

    socket.on("question:set", ({ index }) => {
      const ok = quiz.setCurrentQuestionIndex(Number(index));
      if (!ok) return;
      adminNs.emit("question:change", { index: Number(index) });
      teamNs.emit("question:change", {
        index: Number(index),
        currentQuestion: quiz.getPublicQuestion(quiz.getCurrentQuestion())
      });
      broadcastState(io);
    });

    socket.on("answer:edit", ({ teamId, questionIndex, answers }) => {
      const result = quiz.editTeamAnswer({
        teamId,
        questionIndex: Number(questionIndex),
        answers
      });
      if (result.error) return;
      adminNs.emit("answer:edit", { teamId, questionIndex: Number(questionIndex), answers });
      teamNs.emit("score:update");
      broadcastState(io);
    });
  });

  teamNs.on("connection", (socket) => {
    socket.on("team:register", ({ teamId, teamName }) => {
      const result = quiz.registerOrReconnectTeam({ teamId, teamName });
      if (result.error) {
        socket.emit("team:error", { message: result.error });
        return;
      }
      const finalTeamId = result.team.id;
      socket.data.teamId = finalTeamId;
      socket.join(finalTeamId);
      socket.emit("team:registered", {
        team: result.team,
        teamId: finalTeamId,
        session: quiz.getSessionForTeam(finalTeamId)
      });
      adminNs.emit("team:join", result.team);
      broadcastState(io);
    });

    socket.on("answer:submit", ({ teamId, questionIndex, answers }) => {
      const result = quiz.submitAnswer({
        teamId,
        questionIndex: Number(questionIndex),
        answers
      });
      if (result.error) {
        socket.emit("team:error", { message: result.error });
        return;
      }
      adminNs.emit("answer:submission", {
        teamId,
        questionIndex: Number(questionIndex),
        answers
      });
      const session = quiz.getSessionForTeam(teamId);
      teamNs.to(teamId).emit("team:session", session);
      broadcastState(io);
    });
  });

  leaderboardNs.on("connection", (socket) => {
    socket.emit("leaderboard:update", quiz.getLeaderboard());
  });
}

module.exports = attachSocketHandlers;
