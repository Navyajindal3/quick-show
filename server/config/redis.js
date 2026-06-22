const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || process.env.REDIS_URI;

let redis;
if (!redisUrl) {
  console.log('⚠️ No REDIS_URL/REDIS_URI provided. Using ioredis-mock (In-Memory) as fallback.');
  const RedisMock = require('ioredis-mock');
  redis = new RedisMock();
} else {
  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
  });
}

redis.on('connect', () => {
  console.log('📦 Redis client connected successfully');
});

redis.on('error', (err) => {
  console.error('❌ Redis Connection Error:', err.message);
});

module.exports = redis;
