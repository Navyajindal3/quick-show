require('dotenv').config({ path: __dirname + '/../.env.example' });
process.env.RESEND_API_KEY = 're_123';
process.env.RAZORPAY_KEY_ID = 'rzp_test_123';
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret_123';
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const redis = require('../config/redis');

let replSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replSet.getUri();
  await mongoose.connect(uri);
  // Ensure Redis is connected. In tests, we assume local real redis at 6379 for lua scripts.
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
  await redis.quit();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
  await redis.flushall();
});
