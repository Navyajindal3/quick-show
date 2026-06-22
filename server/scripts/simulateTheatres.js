require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Theatre = require('../models/Theatre');
const Show = require('../models/Show');
const Movie = require('../models/Movie');

const MONGODB_URI = process.env.MONGO_URI;

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

async function simulateTheatres() {
  if (!MONGODB_URI) {
    console.error('Error: MONGO_URI is not defined in .env');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected.');

    // 1. Clear old data
    console.log('\n🧹 Clearing old Theatre and Show data...');
    await Theatre.deleteMany({});
    await Show.deleteMany({});
    console.log('✅ Old data cleared.');

    // 2. Generate Theatres
    console.log('\n🏢 Generating realistic theatres...');
    const insertedTheatres = await Theatre.insertMany(DUMMY_THEATRES);
    console.log(`✅ Created ${insertedTheatres.length} theatres.`);

    // 3. Fetch Movies
    console.log('\n🎬 Fetching movies...');
    const movies = await Movie.find({ isActive: true });
    if (movies.length === 0) {
      console.log('⚠️ No active movies found. Please run the importMovies.js script first.');
      process.exit(1);
    }
    console.log(`✅ Found ${movies.length} active movies.`);

    // 4. Generate Shows & Simulate Bookings
    console.log('\n📅 Generating shows and simulating real-time bookings (this might take a few seconds)...');

    const showsToInsert = [];
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

          // Build seats map and simulate bookings
          const seatsMap = generateSeatsMap(randomScreen.tierConfig);

          showsToInsert.push({
            movie: movie._id,
            theatre: randomTheatre._id,
            screenNumber: randomScreen.screenNumber,
            showTime: showTime,
            categoryPricing: CATEGORY_PRICING,
            seats: seatsMap
          });
        }
      }
    }

    if (showsToInsert.length > 0) {
      console.log(`⏳ Inserting ${showsToInsert.length} shows into the database...`);
      await Show.insertMany(showsToInsert);
      console.log('✅ Successfully inserted all shows with simulated bookings.');
    }

    console.log('\n🎉 Simulation Complete! The platform is now fully populated with production-ready theatre data.');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error simulating theatres:', error.message);
    process.exit(1);
  }
}

simulateTheatres();
