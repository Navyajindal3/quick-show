'use strict';

/**
 * Redis Helpers
 * =============
 * All Redis seat-lock operations.
 *
 * Key structure:
 *   lock:show_<showId>:seat_<seatLabel>  →  <lockToken>   (EX TTL)
 *
 * Design notes:
 *   - Individual seat lock keys are used with NX for atomic acquisition.
 *   - SCAN (not KEYS) is used for listing locked seats — safe at any scale.
 *   - Lua scripts ensure atomic multi-seat verify/release operations.
 *   - Lock ownership is validated by comparing the stored token.
 */

const redis = require('../config/redis');

/**
 * Acquire locks for multiple seats atomically.
 * If ANY seat is already locked or booked, all acquired locks in this
 * batch are rolled back.
 *
 * @param {string} showId
 * @param {string[]} seatLabels - deduplicated seat labels
 * @param {string} lockToken    - caller-generated UUID
 * @param {number} ttlSeconds   - lock TTL
 * @returns {{ success: boolean, conflictingSeat?: string }}
 */
const acquireSeatLocks = async (showId, seatLabels, lockToken, ttlSeconds = 600) => {
  const lockedKeys = [];

  for (const label of seatLabels) {
    const lockKey = `lock:show_${showId}:seat_${label}`;
    const acquired = await redis.set(lockKey, lockToken, 'EX', ttlSeconds, 'NX');
    if (!acquired) {
      // Roll back all acquired locks in this batch
      if (lockedKeys.length > 0) {
        await releaseOwnedLocks(showId, lockedKeys.map(k => k.split('seat_')[1]), lockToken);
      }
      return { success: false, conflictingSeat: label };
    }
    lockedKeys.push(lockKey);
  }

  return { success: true };
};

/**
 * Release locks that are owned by the given lockToken.
 * Uses Lua script to verify ownership before deleting.
 * Safe to call even if some locks are already expired.
 *
 * @param {string} showId
 * @param {string[]} seatLabels
 * @param {string} lockToken
 */
const releaseOwnedLocks = async (showId, seatLabels, lockToken) => {
  if (!Array.isArray(seatLabels) || seatLabels.length === 0 || !lockToken) return;

  const releaseScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  const promises = seatLabels.map((label) =>
    redis.eval(releaseScript, 1, `lock:show_${showId}:seat_${label}`, lockToken)
  );
  await Promise.all(promises);
};

/**
 * Verify that all seat locks are still owned by lockToken.
 * Optionally extends the TTL by extendSeconds if verified.
 *
 * @param {string} showId
 * @param {string[]} seatLabels
 * @param {string} lockToken
 * @param {number} [extendSeconds=0] - if > 0, extend TTL on success
 * @returns {boolean}
 */
const verifyLockOwnership = async (showId, seatLabels, lockToken, extendSeconds = 0) => {
  if (!seatLabels || seatLabels.length === 0 || !lockToken) return false;

  const verifyScript = `
    for i, key in ipairs(KEYS) do
      if redis.call("get", key) ~= ARGV[1] then
        return 0
      end
    end
    ${extendSeconds > 0 ? `
    for i, key in ipairs(KEYS) do
      redis.call("expire", key, tonumber(ARGV[2]))
    end
    ` : ''}
    return 1
  `;

  const keys = seatLabels.map((label) => `lock:show_${showId}:seat_${label}`);
  try {
    const result = await redis.eval(
      verifyScript,
      keys.length,
      ...keys,
      lockToken,
      extendSeconds.toString()
    );
    return result === 1;
  } catch (err) {
    console.warn(`[redis] Lock verification failed for show ${showId}: ${err.message}`);
    return false;
  }
};

/**
 * Get all currently locked seat labels for a show.
 * Uses SCAN (not KEYS) — safe in production.
 *
 * @param {string} showId
 * @returns {string[]} array of seat labels that have active Redis locks
 */
const getLockedSeatsForShow = async (showId) => {
  const pattern = `lock:show_${showId}:seat_*`;
  const lockedLabels = [];
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    for (const key of keys) {
      const label = key.split('seat_')[1];
      if (label) lockedLabels.push(label);
    }
  } while (cursor !== '0');

  return lockedLabels;
};

module.exports = {
  acquireSeatLocks,
  releaseOwnedLocks,
  verifyLockOwnership,
  getLockedSeatsForShow,
};
