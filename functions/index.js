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
    const awardedByThisRequest = Number(session.claimedAt) === now;
    return { awarded: awardedByThisRequest, coinsAwarded: awardedByThisRequest ? REWARD_PER_GAME : 0, gameCoins: Number(user.gameCoins || 0), message: awardedByThisRequest ? undefined : "This session was already claimed." };
  }
  if (reason === "too_soon") throw new HttpsError("failed-precondition", "Play for at least 30 seconds before claiming the participation reward.");
  if (reason === "game_daily_limit") throw new HttpsError("resource-exhausted", "You have already received today's reward for this game.");
  if (reason === "daily_limit") throw new HttpsError("resource-exhausted", "Today's arcade reward limit has been reached.");
  if (reason === "expired") throw new HttpsError("failed-precondition", "This session expired. Start a new game.");
  if (reason === "already_claimed") return { awarded: false, coinsAwarded: 0, gameCoins: Number(user.gameCoins || 0), message: "This session was already claimed." };
  throw new HttpsError("failed-precondition", "This game session cannot be rewarded. Start a new session.");
});


// Website withdrawal flow. Admin authorization is enforced on the server using
// the UID already configured in the Android app; client-side role fields are ignored.
const ADMIN_UID = "uZcwOVMchEWaxj0iEWBCCuvo1Uy2";
function requireAdmin(request) {
  const uid = requireUser(request);
  if (uid !== ADMIN_UID) throw new HttpsError("permission-denied", "Admin access required.");
  return uid;
}
function validUpi(value) {
  return typeof value === "string" && value.trim().length >= 3 &&
    value.trim().length <= 120 && /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(value.trim());
}

exports.createWithdrawalRequest = onCall(async (request) => {
  const uid = requireUser(request);
  const amount = Number(request.data && request.data.amount);
  const upiId = request.data && request.data.upiId;
  if (!Number.isSafeInteger(amount) || amount < 10 || amount > 100000) {
    throw new HttpsError("invalid-argument", "Withdrawal amount must be a whole rupee amount between ₹10 and ₹100000.");
  }
  if (!validUpi(upiId)) throw new HttpsError("invalid-argument", "Enter a valid UPI ID.");
  const db = admin.database();
  const userRef = db.ref("users/" + uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists()) throw new HttpsError("failed-precondition", "KHELOGO account record was not found.");
  const balance = Number((userSnap.val() || {}).balance || 0);
  const pendingSnap = await db.ref("withdrawRequests/" + uid).orderByChild("status").equalTo("Pending").get();
  const pendingTotal = 0;
  let pendingCount = 0;
  pendingSnap.forEach(() => { pendingCount += 1; });
  if (pendingCount >= 3) throw new HttpsError("resource-exhausted", "You already have 3 pending withdrawal requests.");
  if (amount > balance) throw new HttpsError("failed-precondition", "Insufficient wallet balance.");
  const requestRef = db.ref("withdrawRequests/" + uid).push();
  const now = Date.now();
  await requestRef.set({ uid, upiId: upiId.trim(), amount, status: "Pending", createdAt: now });
  return { requestId: requestRef.key, status: "Pending", createdAt: now };
});

exports.listAdminWithdrawals = onCall(async (request) => {
  requireAdmin(request);
  const snap = await admin.database().ref("withdrawRequests").get();
  const requests = [];
  snap.forEach(userNode => {
    userNode.forEach(reqNode => {
      const item = reqNode.val() || {};
      requests.push({ uid: userNode.key, requestId: reqNode.key, upiId: String(item.upiId || ""),
        amount: Number(item.amount || 0), status: String(item.status || "Pending"),
        createdAt: Number(item.createdAt || 0) });
    });
  });
  requests.sort((a,b) => b.createdAt - a.createdAt);
  return { requests: requests.slice(0, 200) };
});

exports.processWithdrawalRequest = onCall(async (request) => {
  requireAdmin(request);
  const uid = request.data && request.data.uid;
  const requestId = request.data && request.data.requestId;
  const action = request.data && request.data.action;
  if (typeof uid !== "string" || typeof requestId !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(uid) || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId) ||
      !["approve", "reject"].includes(action)) {
    throw new HttpsError("invalid-argument", "Invalid withdrawal action.");
  }
  const db = admin.database();
  const reqRef = db.ref("withdrawRequests/" + uid + "/" + requestId);
  let claimError = null;
  const claim = await reqRef.transaction(current => {
    if (!current || current.status !== "Pending") { claimError = "processed"; return; }
    return { ...current, status: action === "approve" ? "Processing" : "Rejected", reviewedAt: Date.now(), reviewedBy: ADMIN_UID };
  }, undefined, false);
  if (!claim.committed) {
    if (claimError === "processed") throw new HttpsError("failed-precondition", "This request has already been processed.");
    throw new HttpsError("not-found", "Withdrawal request not found.");
  }
  if (action === "reject") return { status: "Rejected" };
  const amount = Number((claim.snapshot.val() || {}).amount || 0);
  if (!Number.isSafeInteger(amount) || amount < 10) {
    await reqRef.update({ status: "Pending", reviewError: "invalid_amount" });
    throw new HttpsError("failed-precondition", "Invalid withdrawal amount; request restored to Pending.");
  }
  let insufficient = false;
  const balanceResult = await db.ref("users/" + uid + "/balance").transaction(current => {
    const balance = Number(current || 0);
    if (!Number.isFinite(balance) || balance < amount) { insufficient = true; return; }
    return balance - amount;
  }, undefined, false);
  if (!balanceResult.committed) {
    await reqRef.update({ status: "Pending", reviewError: insufficient ? "insufficient_balance" : "balance_update_failed" });
    throw new HttpsError("failed-precondition", insufficient ? "Insufficient balance. Request restored to Pending." : "Balance update failed; request restored to Pending.");
  }
  await reqRef.update({ status: "Approved", processedAt: Date.now(), reviewedBy: ADMIN_UID });
  return { status: "Approved", amount };
});
