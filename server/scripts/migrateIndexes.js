require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Booking = require('../models/Booking');

async function migrateIndexes() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected.');

    console.log('Syncing Booking indexes...');
    await Booking.syncIndexes();
    console.log('Indexes synced successfully.');

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

migrateIndexes();
