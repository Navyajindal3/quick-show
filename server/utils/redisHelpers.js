const redis = require('../config/redis');

const releaseOwnedLocks = async (showId, seatLabels, lockToken) => {
  if (!Array.isArray(seatLabels) || seatLabels.length === 0 || !lockToken) return;
  const releaseScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  const promises = seatLabels.map((label) => {
    return redis.eval(releaseScript, 1, `lock:show_${showId}:seat_${label}`, lockToken);
  });
  await Promise.all(promises);
};

module.exports = {
  releaseOwnedLocks,
};
