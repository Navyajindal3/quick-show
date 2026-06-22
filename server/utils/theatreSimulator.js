const Theatre = require('../models/Theatre');
const Show = require('../models/Show');
const Movie = require('../models/Movie');

// Helper to randomly distribute sold seats based on tier configurations
function generateSeatsMap(tierConfig) {
  const seats = {};
  for (const tier of tierConfig) {
    for (const row of tier.rows) {
      for (let i = 1; i <= tier.seatsPerRow; i++) {
        const label = `${row}${i}`;
        // Randomly mark 30% to 60% of seats as booked
        const isSold = Math.random() < (0.3 + Math.random() * 0.3);
        seats[label] = {
          status: isSold ? 'booked' : 'available',
          category: tier.categoryName
        };
      }
    }
  }
  return seats;
}

const CATEGORY_PRICING = {
  'Recliner': 500,
  'Premium': 300,
  'Standard': 200,
};

const DUMMY_THEATRES = [
  {
    name: "PVR: Orion Mall",
    location: { address: "Orion Mall, Dr Rajkumar Rd", city: "Bengaluru", state: "Karnataka" },
    screens: [
      {
        screenNumber: 1,
        totalSeats: 100,
        tierConfig: [
          { categoryName: 'Recliner', rows: ['A', 'B'], seatsPerRow: 10 },
          { categoryName: 'Premium', rows: ['C', 'D', 'E', 'F'], seatsPerRow: 10 },
          { categoryName: 'Standard', rows: ['G', 'H', 'I', 'J'], seatsPerRow: 10 },
        ]
      },
      {
        screenNumber: 2,
        totalSeats: 60,
        tierConfig: [
          { categoryName: 'Premium', rows: ['A', 'B', 'C'], seatsPerRow: 10 },
          { categoryName: 'Standard', rows: ['D', 'E', 'F'], seatsPerRow: 10 },
        ]
      }
    ]
  },
  {
    name: "INOX: City Center",
    location: { address: "City Center Mall", city: "Mumbai", state: "Maharashtra" },
    screens: [
      {
        screenNumber: 1,
        totalSeats: 80,
        tierConfig: [
          { categoryName: 'Recliner', rows: ['A', 'B'], seatsPerRow: 10 },
          { categoryName: 'Standard', rows: ['C', 'D', 'E', 'F', 'G', 'H'], seatsPerRow: 10 },
        ]
      }
    ]
  },
  {
    name: "Cinepolis: Nexus",
    location: { address: "Nexus Mall", city: "Delhi", state: "Delhi" },
    screens: [
      {
        screenNumber: 1,
        totalSeats: 60,
        tierConfig: [
          { categoryName: 'Premium', rows: ['A', 'B', 'C'], seatsPerRow: 10 },
          { categoryName: 'Standard', rows: ['D', 'E', 'F'], seatsPerRow: 10 },
        ]
      }
    ]
  },
  {
    name: "PVR: Phoenix Marketcity",
    location: { address: "Phoenix Marketcity", city: "Chennai", state: "Tamil Nadu" },
    screens: [
      {
        screenNumber: 1,
        totalSeats: 100,
        tierConfig: [
          { categoryName: 'Recliner', rows: ['A', 'B'], seatsPerRow: 10 },
          { categoryName: 'Premium', rows: ['C', 'D', 'E', 'F'], seatsPerRow: 10 },
          { categoryName: 'Standard', rows: ['G', 'H', 'I', 'J'], seatsPerRow: 10 },
        ]
      }
    ]
  }
];

const syncShows = async () => {
  try {
    // 1. Setup / Upsert Theatres
    console.log('🏢 Upserting realistic theatres...');
    const insertedTheatres = [];
    for (const theatreData of DUMMY_THEATRES) {
      const theatre = await Theatre.findOneAndUpdate(
        { name: theatreData.name },
        { $set: theatreData },
        { upsert: true, new: true }
      );
      insertedTheatres.push(theatre);
    }
    console.log(`✅ Ensure ${insertedTheatres.length} theatres exist.`);

    // 2. Fetch Active Movies
    console.log('🎬 Fetching active movies for show generation...');
    const movies = await Movie.find({ isActive: true });
    if (movies.length === 0) {
      console.log('⚠️ No active movies found. Skipping show generation.');
      return;
    }
    console.log(`✅ Found ${movies.length} active movies.`);

    // 3. Generate Shows & Simulate Bookings
    console.log('📅 Generating future shows and checking for existing time slots...');

    let showsAdded = 0;
    const now = new Date();

    for (const movie of movies) {
      // Generate shows for the next 3 days
      for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
        const showsCount = Math.floor(Math.random() * 2) + 2; // 2 to 3 shows per day per movie

        for (let s = 0; s < showsCount; s++) {
          // Pick a random theatre and screen
          const randomTheatre = insertedTheatres[Math.floor(Math.random() * insertedTheatres.length)];
          const randomScreen = randomTheatre.screens[Math.floor(Math.random() * randomTheatre.screens.length)];

          // Generate a random hour between 10 AM and 10 PM
          const showHour = Math.floor(Math.random() * 12) + 10;
          const showTime = new Date(now);
          showTime.setDate(now.getDate() + dayOffset);
          showTime.setHours(showHour, 0, 0, 0);

          // Only generate if time is actually in the future
          if (showTime <= now) continue;

          // Check if show already exists for specific movie, theatre, and showTime
          const existingShow = await Show.findOne({
            movie: movie._id,
            theatre: randomTheatre._id,
            showTime: showTime
          });

          if (!existingShow) {
            // Build seats map and simulate bookings
            const seatsMap = generateSeatsMap(randomScreen.tierConfig);

            await Show.create({
              movie: movie._id,
              theatre: randomTheatre._id,
              screenNumber: randomScreen.screenNumber,
              showTime: showTime,
              categoryPricing: CATEGORY_PRICING,
              seats: seatsMap
            });
            showsAdded++;
          }
        }
      }
    }

    console.log(`✅ Show sync complete. Appended ${showsAdded} new shows to the schedule.`);

  } catch (error) {
    console.error('❌ Error simulating theatres and shows:', error.message);
  }
};

module.exports = { syncShows };
