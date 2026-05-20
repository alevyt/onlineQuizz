const quiz = require("./quizController");

function sessionRoom(sessionId) {
  return "session:" + sessionId;
}

function teamRoom(sessionId, teamId) {
  return sessionRoom(sessionId) + ":team:" + teamId;
}

function broadcastState(io, sessionId) {
  const room = sessionRoom(sessionId);
  const adminSession = quiz.getSessionForAdmin(sessionId);
  const leaderboard = quiz.getLeaderboard(sessionId);
  const submissions = quiz.getSubmissionsView(sessionId);
  io.of("/admin").to(room).emit("session:restored", {
    session: adminSession,
    leaderboard,
    submissions
  });
  io.of("/leaderboard").to(room).emit("leaderboard:update", leaderboard);
  io.of("/team").to(room).emit("quiz:state", {
    quizStarted: adminSession.quizStarted,
    quizFinished: adminSession.quizFinished,
    currentQuestionIndex: adminSession.currentQuestionIndex,
    currentQuestion: quiz.getPublicQuestion(quiz.getCurrentQuestion(sessionId))
  });
  io.of("/admin").to(room).emit("teams:update", Object.values(quiz.getState(sessionId).teams));
  io.of("/admin").to(room).emit("submissions:update", submissions);
}

function attachSocketHandlers(io, isAdminSocketAuthorized) {
  const adminNs = io.of("/admin");
  const teamNs = io.of("/team");
  const leaderboardNs = io.of("/leaderboard");
  const timers = new Map();

  function resolveSessionId(socket) {
    const sessionId = quiz.normalizeSessionId(
      socket.handshake.query && socket.handshake.query.sessionId
    );
    if (!sessionId || !quiz.sessionExists(sessionId)) return null;
    return sessionId;
  }

  function getTimerState(sessionId) {
    return (
      timers.get(sessionId) || {
        interval: null,
        endAt: 0,
        durationSec: 0,
        questionIndex: -1
      }
    );
  }

  function setTimerState(sessionId, value) {
    timers.set(sessionId, value);
  }

  function getTimerPayload(sessionId) {
    const timer = getTimerState(sessionId);
    if (!timer.endAt || !timer.durationSec) {
      return { active: false, remainingSec: 0, durationSec: 0, questionIndex: -1 };
    }
    const remainingSec = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
    return {
      active: remainingSec > 0,
      remainingSec,
      durationSec: timer.durationSec,
      questionIndex: timer.questionIndex
    };
  }

  function emitTimerUpdate(sessionId) {
    const payload = getTimerPayload(sessionId);
    const room = sessionRoom(sessionId);
    adminNs.to(room).emit("timer:update", payload);
    teamNs.to(room).emit("timer:update", payload);
  }

  function clearTimer(sessionId) {
    const timer = getTimerState(sessionId);
    if (timer.interval) {
      clearInterval(timer.interval);
    }
    setTimerState(sessionId, {
      interval: null,
      endAt: 0,
      durationSec: 0,
      questionIndex: -1
    });
    emitTimerUpdate(sessionId);
  }

  function startTimer(sessionId, seconds) {
    const duration = Math.max(1, Math.floor(Number(seconds) || 0));
    const session = quiz.getSessionForAdmin(sessionId);
    if (!session || session.currentQuestionIndex < 0 || session.quizFinished) return false;
    clearTimer(sessionId);
    const timer = {
      interval: null,
      durationSec: duration,
      questionIndex: session.currentQuestionIndex,
      endAt: Date.now() + duration * 1000
    };
    emitTimerUpdate(sessionId);
    const room = sessionRoom(sessionId);
    timer.interval = setInterval(() => {
      const remainingSec = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
      const currentSession = quiz.getSessionForAdmin(sessionId);
      if (
        !currentSession ||
        currentSession.currentQuestionIndex !== timer.questionIndex ||
        currentSession.quizFinished
      ) {
        clearTimer(sessionId);
        return;
      }
      if (remainingSec <= 0) {
        const lastIndex = (currentSession.questions || []).length - 1;
        if (currentSession.currentQuestionIndex >= lastIndex) {
          quiz.finishQuiz(sessionId);
          adminNs.to(room).emit("quiz:finish");
          teamNs.to(room).emit("quiz:finish");
        } else {
          const nextIndex = currentSession.currentQuestionIndex + 1;
          quiz.setCurrentQuestionIndex(sessionId, nextIndex);
          adminNs.to(room).emit("question:change", { index: nextIndex });
          teamNs.to(room).emit("question:change", {
            index: nextIndex,
            currentQuestion: quiz.getPublicQuestion(quiz.getCurrentQuestion(sessionId))
          });
        }
        clearTimer(sessionId);
        broadcastState(io, sessionId);
        return;
      }
      emitTimerUpdate(sessionId);
    }, 500);
    setTimerState(sessionId, timer);
    return true;
  }

  function requireSessionMiddleware(socket, next) {
    const sessionId = resolveSessionId(socket);
    if (!sessionId) return next(new Error("Invalid or missing session"));
    socket.data.sessionId = sessionId;
    socket.join(sessionRoom(sessionId));
    return next();
  }

  adminNs.use(requireSessionMiddleware);
  adminNs.use((socket, next) => {
    if (typeof isAdminSocketAuthorized !== "function") return next();
    const cookieHeader = socket.handshake.headers ? socket.handshake.headers.cookie : "";
    if (isAdminSocketAuthorized(cookieHeader)) return next();
    return next(new Error("Unauthorized"));
  });

  teamNs.use(requireSessionMiddleware);
  leaderboardNs.use(requireSessionMiddleware);

  adminNs.on("connection", (socket) => {
    const sessionId = socket.data.sessionId;
    const room = sessionRoom(sessionId);
    socket.emit("session:restored", {
      session: quiz.getSessionForAdmin(sessionId),
      leaderboard: quiz.getLeaderboard(sessionId),
      submissions: quiz.getSubmissionsView(sessionId)
    });
    socket.emit("teams:update", Object.values(quiz.getState(sessionId).teams));
    socket.emit("timer:update", getTimerPayload(sessionId));

    socket.on("quiz:start", () => {
      clearTimer(sessionId);
      const ok = quiz.startQuiz(sessionId);
      if (ok) {
        adminNs.to(room).emit("quiz:start");
        teamNs.to(room).emit("quiz:start");
        broadcastState(io, sessionId);
      }
    });

    socket.on("quiz:finish", () => {
      clearTimer(sessionId);
      quiz.finishQuiz(sessionId);
      adminNs.to(room).emit("quiz:finish");
      teamNs.to(room).emit("quiz:finish");
      broadcastState(io, sessionId);
    });

    socket.on("quiz:clear", () => {
      clearTimer(sessionId);
      quiz.clearQuiz(sessionId);
      adminNs.to(room).emit("quiz:clear");
      teamNs.to(room).emit("quiz:clear");
      broadcastState(io, sessionId);
    });

    socket.on("teams:clear", () => {
      quiz.clearTeams(sessionId);
      adminNs.to(room).emit("teams:clear");
      teamNs.to(room).emit("teams:clear");
      broadcastState(io, sessionId);
    });

    socket.on("question:set", ({ index }) => {
      clearTimer(sessionId);
      const ok = quiz.setCurrentQuestionIndex(sessionId, Number(index));
      if (!ok) return;
      adminNs.to(room).emit("question:change", { index: Number(index) });
      teamNs.to(room).emit("question:change", {
        index: Number(index),
        currentQuestion: quiz.getPublicQuestion(quiz.getCurrentQuestion(sessionId))
      });
      broadcastState(io, sessionId);
    });

    socket.on("timer:start", ({ seconds }) => {
      const ok = startTimer(sessionId, seconds);
      if (!ok) return;
      broadcastState(io, sessionId);
    });

    socket.on("answer:edit", ({ teamId, questionIndex, answers, isCorrect }) => {
      const result = quiz.editTeamAnswer(sessionId, {
        teamId,
        questionIndex: Number(questionIndex),
        answers,
        isCorrect: isCorrect === null || typeof isCorrect === "boolean" ? isCorrect : undefined
      });
      if (result.error) return;
      adminNs.to(room).emit("answer:edit", {
        teamId,
        questionIndex: Number(questionIndex),
        answers,
        isCorrect: typeof isCorrect === "boolean" ? isCorrect : null
      });
      teamNs.to(teamRoom(sessionId, teamId)).emit("score:update");
      broadcastState(io, sessionId);
    });

    socket.on("team:approve", ({ teamId }) => {
      const result = quiz.approveTeam(sessionId, teamId);
      if (result.error) return;
      teamNs.to(teamRoom(sessionId, teamId)).emit("team:approved");
      teamNs.to(teamRoom(sessionId, teamId)).emit("team:session", quiz.getSessionForTeam(sessionId, teamId));
      adminNs.to(room).emit("team:approved", { teamId });
      broadcastState(io, sessionId);
    });

    socket.on("team:kick", ({ teamId }) => {
      const result = quiz.kickTeam(sessionId, teamId);
      if (result.error) return;
      teamNs.to(teamRoom(sessionId, teamId)).emit("team:kicked");
      adminNs.to(room).emit("team:kicked", { teamId });
      broadcastState(io, sessionId);
    });

    socket.on("team:clear-info", ({ teamId }) => {
      const result = quiz.kickTeam(sessionId, teamId);
      if (result.error) return;
      teamNs.to(teamRoom(sessionId, teamId)).emit("team:kicked");
      adminNs.to(room).emit("team:cleared", { teamId });
      broadcastState(io, sessionId);
    });

    socket.on("team:disqualify", ({ teamId }) => {
      const result = quiz.kickTeam(sessionId, teamId);
      if (result.error) return;
      teamNs.to(teamRoom(sessionId, teamId)).emit("team:disqualified");
      adminNs.to(room).emit("team:disqualified", { teamId });
      broadcastState(io, sessionId);
    });

    socket.on("team:warn", ({ teamId, message }) => {
      const state = quiz.getState(sessionId);
      const team = state && state.teams[teamId];
      if (!team) return;
      const text = String(message || "").trim().slice(0, 500);
      if (!text) return;
      teamNs.to(teamRoom(sessionId, teamId)).emit("team:warn", { message: text });
      adminNs.to(room).emit("team:warned", { teamId, message: text });
    });
  });

  teamNs.on("connection", (socket) => {
    const sessionId = socket.data.sessionId;
    const room = sessionRoom(sessionId);
    socket.emit("timer:update", getTimerPayload(sessionId));

    socket.on("team:register", ({ teamId, teamName, resetExisting }) => {
      const result = quiz.registerOrReconnectTeam(sessionId, { teamId, teamName, resetExisting });
      if (result.error) {
        socket.emit("team:error", { message: result.error });
        return;
      }
      const finalTeamId = result.team.id;
      socket.data.teamId = finalTeamId;
      socket.join(teamRoom(sessionId, finalTeamId));
      socket.emit("team:registered", {
        team: result.team,
        teamId: finalTeamId,
        approved: Boolean(result.approved),
        resetCount: result.resetCount || 0,
        session: quiz.getSessionForTeam(sessionId, finalTeamId)
      });
      adminNs.to(room).emit("team:join", result.team);
      broadcastState(io, sessionId);
    });

    socket.on("answer:submit", ({ teamId, questionIndex, answers }) => {
      const result = quiz.submitAnswer(sessionId, {
        teamId,
        questionIndex: Number(questionIndex),
        answers
      });
      if (result.error) {
        socket.emit("team:error", { message: result.error });
        return;
      }
      adminNs.to(room).emit("answer:submission", {
        teamId,
        questionIndex: Number(questionIndex),
        answers
      });
      const session = quiz.getSessionForTeam(sessionId, teamId);
      teamNs.to(teamRoom(sessionId, teamId)).emit("team:session", session);
      broadcastState(io, sessionId);
    });

    socket.on("team:visibility", ({ teamId, away }) => {
      const id = (teamId || socket.data.teamId || "").trim();
      if (!id || id !== socket.data.teamId) return;
      const result = quiz.setTeamAway(sessionId, id, Boolean(away));
      if (result.error) return;
      adminNs.to(room).emit("teams:update", Object.values(quiz.getState(sessionId).teams));
      if (away) {
        socket.emit("team:visibility-warning");
      } else {
        socket.emit("team:visibility-clear");
      }
    });

    socket.on("disconnect", () => {
      if (!socket.data.teamId) return;
      quiz.setTeamAway(sessionId, socket.data.teamId, false);
      adminNs.to(room).emit("teams:update", Object.values(quiz.getState(sessionId).teams));
    });
  });

  leaderboardNs.on("connection", (socket) => {
    const sessionId = socket.data.sessionId;
    socket.emit("leaderboard:update", quiz.getLeaderboard(sessionId));
  });
}

module.exports = attachSocketHandlers;
