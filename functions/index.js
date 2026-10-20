"use strict";

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const crypto = require("node:crypto");

admin.initializeApp();
setGlobalOptions({ region: "asia-southeast1", maxInstances: 10 });

const ALLOWED_GAMES = new Set([
  "Ludo", "LuckyJava", "Mines", "Aviator", "Runway Surfing",
  "Chicken Road", "Dragon Tiger", "Reaction Rush",
  "Carrom Mini", "Battle Arena Mini"
]);
const MIN_SESSION_MS = 30_000;
const REWARD_PER_GAME = 1;
const MAX_DAILY_REWARD = 5;

function requireUser(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "Sign in to use KHELOGO arcade rewards.");
  }
  return request.auth.uid;
}
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}
function cleanOldSessions(sessions, now) {
  const next = sessions && typeof sessions === "object" ? { ...sessions } : {};
  for (const [id, session] of Object.entries(next)) {
    if (!session || !Number.isFinite(Number(session.startedAt)) ||
        now - Number(session.startedAt) > 48 * 60 * 60 * 1000) delete next[id];
  }
  const ids = Object.keys(next);
  if (ids.length > 20) {
    ids.sort((a, b) => Number(next[a]?.startedAt || 0) - Number(next[b]?.startedAt || 0));
    for (const id of ids.slice(0, ids.length - 20)) delete next[id];
  }
  return next;
}

exports.startArcadeSession = onCall(async (request) => {
  const uid = requireUser(request);
  const game = request.data && request.data.game;
  if (typeof game !== "string" || !ALLOWED_GAMES.has(game)) {
    throw new HttpsError("invalid-argument", "Unknown KHELOGO game.");
  }
  const userRef = admin.database().ref("users/" + uid);
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const day = todayUtc();
  const result = await userRef.transaction((user) => {
    if (!user || typeof user !== "object") return;
    const sessions = cleanOldSessions(user.arcadeSessions, now);
    sessions[sessionId] = { game, startedAt: now, day, status: "active" };
    return { ...user, arcadeSessions: sessions };
  });
  if (!result.committed || !result.snapshot.exists()) {
    throw new HttpsError("failed-precondition", "Your KHELOGO account record is missing. No coins were changed.");
  }
  return { sessionId, minimumPlaySeconds: MIN_SESSION_MS / 1000, rewardCoins: REWARD_PER_GAME };
});

exports.completeArcadeSession = onCall(async (request) => {
  const uid = requireUser(request);
  const sessionId = request.data && request.data.sessionId;
  if (typeof sessionId !== "string" || !/^[a-f0-9-]{36}$/i.test(sessionId)) {
    throw new HttpsError("invalid-argument", "Invalid arcade session.");
  }
  const userRef = admin.database().ref("users/" + uid);
  const now = Date.now();
  const day = todayUtc();
  let reason = "invalid";
  const result = await userRef.transaction((user) => {
    if (!user || typeof user !== "object") return;
    const sessions = user.arcadeSessions && typeof user.arcadeSessions === "object"
      ? { ...user.arcadeSessions } : {};
    const session = sessions[sessionId];
    if (!session) { reason = "missing"; return; }
    if (session.status === "claimed") { reason = "already_claimed"; return user; }
    if (session.status !== "active") { reason = "already_used"; return user; }
    if (now - Number(session.startedAt || 0) < MIN_SESSION_MS) {
      reason = "too_soon"; return user;
    }
    if (session.day !== day) {
      sessions[sessionId] = { ...session, status: "expired" };
      reason = "expired";
      return { ...user, arcadeSessions: sessions };
    }

    const claimsByDay = user.arcadeRewardClaims && typeof user.arcadeRewardClaims === "object"
      ? { ...user.arcadeRewardClaims } : {};
    const todayClaims = claimsByDay[day] && typeof claimsByDay[day] === "object"
      ? { ...claimsByDay[day] } : { games: {}, total: 0 };
    const games = todayClaims.games && typeof todayClaims.games === "object"
      ? { ...todayClaims.games } : {};
    if (games[session.game]) {
      sessions[sessionId] = { ...session, status: "rejected" };
      reason = "game_daily_limit";
      return { ...user, arcadeSessions: sessions };
    }
    if (Number(todayClaims.total || 0) >= MAX_DAILY_REWARD) {
      sessions[sessionId] = { ...session, status: "rejected" };
      reason = "daily_limit";
      return { ...user, arcadeSessions: sessions };
    }

    games[session.game] = true;
    claimsByDay[day] = { games, total: Number(todayClaims.total || 0) + REWARD_PER_GAME };
    sessions[sessionId] = { ...session, status: "claimed", claimedAt: now, reward: REWARD_PER_GAME };
    reason = "awarded";
    return {
      ...user,
      gameCoins: Math.max(0, Number(user.gameCoins || 0)) + REWARD_PER_GAME,
      arcadeSessions: sessions,
      arcadeRewardClaims: claimsByDay,
      lastArcadeRewardAt: now
    };
  }, undefined, false);

  if (!result.committed || !result.snapshot.exists()) {
    throw new HttpsError("failed-precondition", "Your KHELOGO account record is missing. No coins were changed.");
  }
  const user = result.snapshot.val() || {};
  const session = user.arcadeSessions && user.arcadeSessions[sessionId];
  if (session && session.status === "claimed") {
    return { awarded: true, coinsAwarded: REWARD_PER_GAME, gameCoins: Number(user.gameCoins || 0) };
  }
  if (reason === "too_soon") throw new HttpsError("failed-precondition", "Play for at least 30 seconds before claiming the participation reward.");
  if (reason === "game_daily_limit") throw new HttpsError("resource-exhausted", "You have already received today's reward for this game.");
  if (reason === "daily_limit") throw new HttpsError("resource-exhausted", "Today's arcade reward limit has been reached.");
  if (reason === "expired") throw new HttpsError("failed-precondition", "This session expired. Start a new game.");
  if (reason === "already_claimed") return { awarded: false, coinsAwarded: 0, gameCoins: Number(user.gameCoins || 0), message: "This session was already claimed." };
  throw new HttpsError("failed-precondition", "This game session cannot be rewarded. Start a new session.");
});
