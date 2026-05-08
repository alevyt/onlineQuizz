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

function attachSocketHandlers(io, isAdminSocketAuthorized) {
  const adminNs = io.of("/admin");
  const teamNs = io.of("/team");
  const leaderboardNs = io.of("/leaderboard");
  let timerInterval = null;
  let timerEndAt = 0;
  let timerDurationSec = 0;
  let timerQuestionIndex = -1;

  function getTimerPayload() {
    if (!timerEndAt || !timerDurationSec) {
      return { active: false, remainingSec: 0, durationSec: 0, questionIndex: -1 };
    }
    const remainingSec = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));
    return {
      active: remainingSec > 0,
      remainingSec,
      durationSec: timerDurationSec,
      questionIndex: timerQuestionIndex
    };
  }

  function emitTimerUpdate() {
    const payload = getTimerPayload();
    adminNs.emit("timer:update", payload);
    teamNs.emit("timer:update", payload);
  }

  function clearTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    timerEndAt = 0;
    timerDurationSec = 0;
    timerQuestionIndex = -1;
    emitTimerUpdate();
  }

  function startTimer(seconds) {
    const duration = Math.max(1, Math.floor(Number(seconds) || 0));
    const session = quiz.getSessionForAdmin();
    if (session.currentQuestionIndex < 0 || session.quizFinished) return false;
    clearTimer();
    timerDurationSec = duration;
    timerQuestionIndex = session.currentQuestionIndex;
    timerEndAt = Date.now() + duration * 1000;
    emitTimerUpdate();
    timerInterval = setInterval(() => {
      const remainingSec = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));
      const currentSession = quiz.getSessionForAdmin();
      if (currentSession.currentQuestionIndex !== timerQuestionIndex || currentSession.quizFinished) {
        clearTimer();
        return;
      }
      if (remainingSec <= 0) {
        const lastIndex = (currentSession.questions || []).length - 1;
        if (currentSession.currentQuestionIndex >= lastIndex) {
          quiz.finishQuiz();
          adminNs.emit("quiz:finish");
          teamNs.emit("quiz:finish");
        } else {
          const nextIndex = currentSession.currentQuestionIndex + 1;
          quiz.setCurrentQuestionIndex(nextIndex);
          adminNs.emit("question:change", { index: nextIndex });
          teamNs.emit("question:change", {
            index: nextIndex,
            currentQuestion: quiz.getPublicQuestion(quiz.getCurrentQuestion())
          });
        }
        clearTimer();
        broadcastState(io);
        return;
      }
      emitTimerUpdate();
    }, 500);
    return true;
  }

  adminNs.use((socket, next) => {
    if (typeof isAdminSocketAuthorized !== "function") return next();
    const cookieHeader = socket.handshake.headers ? socket.handshake.headers.cookie : "";
    if (isAdminSocketAuthorized(cookieHeader)) return next();
    return next(new Error("Unauthorized"));
  });

  adminNs.on("connection", (socket) => {
    socket.emit("session:restored", {
      session: quiz.getSessionForAdmin(),
      leaderboard: quiz.getLeaderboard(),
      submissions: quiz.getSubmissionsView()
    });
    socket.emit("teams:update", Object.values(quiz.getState().teams));
    socket.emit("timer:update", getTimerPayload());

    socket.on("quiz:start", () => {
      clearTimer();
      const ok = quiz.startQuiz();
      if (ok) {
        adminNs.emit("quiz:start");
        teamNs.emit("quiz:start");
        broadcastState(io);
      }
    });

    socket.on("quiz:finish", () => {
      clearTimer();
      quiz.finishQuiz();
      adminNs.emit("quiz:finish");
      teamNs.emit("quiz:finish");
      broadcastState(io);
    });

    socket.on("quiz:clear", () => {
      clearTimer();
      quiz.clearQuiz();
      adminNs.emit("quiz:clear");
      teamNs.emit("quiz:clear");
      broadcastState(io);
    });

    socket.on("teams:clear", () => {
      quiz.clearTeams();
      adminNs.emit("teams:clear");
      teamNs.emit("teams:clear");
      broadcastState(io);
    });

    socket.on("question:set", ({ index }) => {
      clearTimer();
      const ok = quiz.setCurrentQuestionIndex(Number(index));
      if (!ok) return;
      adminNs.emit("question:change", { index: Number(index) });
      teamNs.emit("question:change", {
        index: Number(index),
        currentQuestion: quiz.getPublicQuestion(quiz.getCurrentQuestion())
      });
      broadcastState(io);
    });

    socket.on("timer:start", ({ seconds }) => {
      const ok = startTimer(seconds);
      if (!ok) return;
      broadcastState(io);
    });

    socket.on("answer:edit", ({ teamId, questionIndex, answers, isCorrect }) => {
      const result = quiz.editTeamAnswer({
        teamId,
        questionIndex: Number(questionIndex),
        answers,
        isCorrect: isCorrect === null || typeof isCorrect === "boolean" ? isCorrect : undefined
      });
      if (result.error) return;
      adminNs.emit("answer:edit", {
        teamId,
        questionIndex: Number(questionIndex),
        answers,
        isCorrect: typeof isCorrect === "boolean" ? isCorrect : null
      });
      teamNs.emit("score:update");
      broadcastState(io);
    });

    socket.on("team:approve", ({ teamId }) => {
      const result = quiz.approveTeam(teamId);
      if (result.error) return;
      teamNs.to(teamId).emit("team:approved");
      teamNs.to(teamId).emit("team:session", quiz.getSessionForTeam(teamId));
      adminNs.emit("team:approved", { teamId });
      broadcastState(io);
    });

    socket.on("team:kick", ({ teamId }) => {
      const result = quiz.kickTeam(teamId);
      if (result.error) return;
      teamNs.to(teamId).emit("team:kicked");
      adminNs.emit("team:kicked", { teamId });
      broadcastState(io);
    });

    socket.on("team:clear-info", ({ teamId }) => {
      const result = quiz.kickTeam(teamId);
      if (result.error) return;
      teamNs.to(teamId).emit("team:kicked");
      adminNs.emit("team:cleared", { teamId });
      broadcastState(io);
    });

    socket.on("team:disqualify", ({ teamId }) => {
      const result = quiz.kickTeam(teamId);
      if (result.error) return;
      teamNs.to(teamId).emit("team:disqualified");
      adminNs.emit("team:disqualified", { teamId });
      broadcastState(io);
    });
  });

  teamNs.on("connection", (socket) => {
    socket.emit("timer:update", getTimerPayload());
    socket.on("team:register", ({ teamId, teamName, resetExisting }) => {
      const result = quiz.registerOrReconnectTeam({ teamId, teamName, resetExisting });
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
        approved: Boolean(result.approved),
        resetCount: result.resetCount || 0,
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
