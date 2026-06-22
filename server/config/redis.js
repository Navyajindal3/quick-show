const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || process.env.REDIS_URI;

let redis;
if (!redisUrl && process.env.NODE_ENV !== 'production') {
  console.log('⚠️ No REDIS_URL/REDIS_URI provided. Using ioredis-mock (In-Memory) for local development.');
  const RedisMock = require('ioredis-mock');
  redis = new RedisMock();
} else {
  redis = new Redis(redisUrl || 'redis://127.0.0.1:6379', {
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
