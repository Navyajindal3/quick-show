'use strict';

/**
 * Cron Jobs
 * =========
 * Scheduled background tasks. Initialized once at server startup.
 *
 * Schedule:
 *   - Reconciliation:  Every 5 minutes (catches failed emails, stuck jobs)
 *   - Movie sync:      Daily at midnight
 *   - Show sync:       Daily at 01:00 AM
 */

const cron = require('node-cron');
const { syncMovies } = require('./movieUpdater');
const { syncShows } = require('./theatreSimulator');
const { runReconciliation } = require('../services/reconciliationService');

const initCronJobs = () => {
  console.log('⏰ Initializing cron jobs...');

  // ── Reconciliation every 5 minutes ────────────────────────────────────────
  cron.schedule('*/5 * * * *', async () => {
    try {
      await runReconciliation();
    } catch (err) {
      console.error('[cron] Reconciliation job error:', err.message);
    }
  });

  // ── Movie sync: daily at midnight ─────────────────────────────────────────
  cron.schedule('0 0 * * *', async () => {
    console.log('[cron] Starting daily movie synchronization...');
    try {
      await syncMovies();
      console.log('[cron] Movie synchronization complete');
    } catch (err) {
      console.error('[cron] Movie sync error:', err.message);
    }
  });

  // ── Show sync: daily at 01:00 AM ──────────────────────────────────────────
  cron.schedule('0 1 * * *', async () => {
    console.log('[cron] Starting daily show simulation...');
    try {
      await syncShows();
      console.log('[cron] Show simulation complete');
    } catch (err) {
      console.error('[cron] Show sync error:', err.message);
    }
  });

  console.log('✅ Cron jobs scheduled:');
  console.log('   - Reconciliation:    every 5 minutes');
  console.log('   - Movie sync:        daily at 00:00');
  console.log('   - Show simulation:   daily at 01:00');
};

module.exports = { initCronJobs };
