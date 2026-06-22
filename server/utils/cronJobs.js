const cron = require('node-cron');
const { syncMovies } = require('./movieUpdater');
const { syncShows } = require('./theatreSimulator');

const initCronJobs = () => {
  console.log('⏰ Initializing automated cron jobs...');

  // Run syncMovies every day at Midnight
  cron.schedule('0 0 * * *', async () => {
    console.log('🔄 [CRON JOB] Starting daily movie synchronization...');
    await syncMovies();
    console.log('✅ [CRON JOB] Movie synchronization completed.');
  });

  // Run syncShows every day at 1:00 AM
  cron.schedule('0 1 * * *', async () => {
    console.log('🔄 [CRON JOB] Starting daily theatre/show simulation...');
    await syncShows();
    console.log('✅ [CRON JOB] Theatre/show simulation completed.');
  });

  console.log('✅ Automated cron jobs scheduled:');
  console.log('   - Movies sync: Every day at 12:00 AM');
  console.log('   - Shows sync: Every day at 01:00 AM');
};

module.exports = { initCronJobs };
