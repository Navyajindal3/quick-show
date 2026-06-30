/**
 * Secure Seed Script
 * ==================
 * Seeds the database with an administrator account and sample data.
 *
 * REQUIRED environment variables:
 *   SEED_ADMIN_EMAIL    — valid email address for the administrator account
 *   SEED_ADMIN_PASSWORD — password with min 12 chars, upper/lower/digit/symbol
 *
 * Usage (from /server directory):
 *   SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='Str0ng!Pass' node seed.js
 *
 * Or set variables in your .env file and run:
 *   node seed.js
 *
 * Safe to run multiple times — will update an existing admin rather than duplicate.
 * Exits with non-zero status on any failure.
 */

'use strict';

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config(); // Load .env from current directory (server/)

// ─── Validate required seed credentials ────────────────────────────────────
const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, MONGO_URI } = process.env;

const errors = [];

if (!MONGO_URI) {
  errors.push('MONGO_URI is required');
}

if (!SEED_ADMIN_EMAIL) {
  errors.push('SEED_ADMIN_EMAIL is required');
} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(SEED_ADMIN_EMAIL)) {
  errors.push('SEED_ADMIN_EMAIL must be a valid email address');
}

if (!SEED_ADMIN_PASSWORD) {
  errors.push('SEED_ADMIN_PASSWORD is required');
} else {
  const pwd = SEED_ADMIN_PASSWORD;
  const pwdErrors = [];
  if (pwd.length < 12) pwdErrors.push('at least 12 characters');
  if (!/[A-Z]/.test(pwd)) pwdErrors.push('at least one uppercase letter');
  if (!/[a-z]/.test(pwd)) pwdErrors.push('at least one lowercase letter');
  if (!/\d/.test(pwd)) pwdErrors.push('at least one digit');
  if (!/[^A-Za-z0-9]/.test(pwd)) pwdErrors.push('at least one special character');
  if (pwdErrors.length > 0) {
    errors.push(`SEED_ADMIN_PASSWORD must contain: ${pwdErrors.join(', ')}`);
  }
}

if (errors.length > 0) {
  console.error('❌ Seed script validation failed:');
  errors.forEach((e) => console.error(`   • ${e}`));
  process.exit(1);
}

const User = require('./models/User');
const Movie = require('./models/Movie');
const Theatre = require('./models/Theatre');
const Show = require('./models/Show');

const generateSeatMap = (tierConfig) => {
  const seatMap = {};
  for (const tier of tierConfig) {
    for (const row of tier.rows) {
      for (let c = 1; c <= tier.seatsPerRow; c++) {
        seatMap[`${row}${c}`] = { status: 'available', category: tier.categoryName };
      }
    }
  }
  return seatMap;
};

const seed = async () => {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  // ─── Admin User (upsert — never duplicate, never print password) ──────────
  const existingAdmin = await User.findOne({ email: SEED_ADMIN_EMAIL.toLowerCase() });

  if (!existingAdmin) {
    await User.create({
      name: 'Administrator',
      email: SEED_ADMIN_EMAIL.toLowerCase(),
      password: SEED_ADMIN_PASSWORD,
      role: 'admin',
    });
    console.log(`👤 Admin user created: ${SEED_ADMIN_EMAIL}`);
  } else if (existingAdmin.role !== 'admin') {
    // Promote to admin if account exists with different role (explicit operator intent)
    existingAdmin.role = 'admin';
    existingAdmin.password = SEED_ADMIN_PASSWORD;
    await existingAdmin.save();
    console.log(`👤 Existing account promoted to admin: ${SEED_ADMIN_EMAIL}`);
  } else {
    console.log(`👤 Admin already exists, skipping creation: ${SEED_ADMIN_EMAIL}`);
  }

  // ─── Clear and reseed sample data ─────────────────────────────────────────
  await Movie.deleteMany({});
  await Theatre.deleteMany({});
  await Show.deleteMany({});
  console.log('🗑️  Cleared existing movies, theatres, shows');

  // ─── Movies ────────────────────────────────────────────────────────────────
  const movies = await Movie.insertMany([
    {
      title: 'Kalki 2898-AD',
      description:
        'A sci-fi mythological action epic set in the futuristic city of Kasi. When an ancient warrior is reborn, the fate of humanity changes forever.',
      genre: ['Action', 'Sci-Fi', 'Mythology'],
      language: 'Hindi',
      duration: 180,
      releaseDate: new Date('2024-06-27'),
      posterUrl:
        'https://m.media-amazon.com/images/M/MV5BNGUzNDY4ZmItMzYyOC00ODA5LWI3NTEtMmQ4YjJlODRmY2UxXkEyXkFqcGdeQXVyMTUzNTgzNzM0._V1_.jpg',
      rating: 7.4,
      director: 'Nag Ashwin',
      cast: ['Prabhas', 'Deepika Padukone', 'Amitabh Bachchan', 'Kamal Haasan'],
      isActive: true,
    },
    {
      title: 'Animal',
      description:
        "A son goes to extreme lengths to protect his family empire after an attempt on his father's life.",
      genre: ['Action', 'Drama', 'Thriller'],
      language: 'Hindi',
      duration: 202,
      releaseDate: new Date('2023-12-01'),
      posterUrl:
        'https://m.media-amazon.com/images/M/MV5BMjI4ZDI5ZmQtZGNjYi00Y2E4LWJhZGQtMDc2MzA3YzBmYTkwXkEyXkFqcGdeQXVyMTUzNTgzNzM0._V1_FMjpg_UX1000_.jpg',
      rating: 6.5,
      director: 'Sandeep Reddy Vanga',
      cast: ['Ranbir Kapoor', 'Rashmika Mandanna', 'Anil Kapoor', 'Bobby Deol'],
      isActive: true,
    },
    {
      title: 'Pushpa 2: The Rule',
      description:
        'Pushpa Raj returns stronger than ever, ruling the red sandalwood smuggling trade while facing powerful enemies.',
      genre: ['Action', 'Drama', 'Crime'],
      language: 'Hindi',
      duration: 190,
      releaseDate: new Date('2024-12-05'),
      posterUrl:
        'https://m.media-amazon.com/images/M/MV5BNTNiNzY0NjctNTQ4ZS00ZGZiLTk2ODktMjQ3YWFiN2Q2MjkzXkEyXkFqcGdeQXVyMTUzNTgzNzM0._V1_.jpg',
      rating: 7.9,
      director: 'Sukumar',
      cast: ['Allu Arjun', 'Rashmika Mandanna', 'Fahadh Faasil'],
      isActive: true,
    },
    {
      title: 'Stree 2',
      description: 'The residents of Chanderi face a terrifying new supernatural threat.',
      genre: ['Horror', 'Comedy'],
      language: 'Hindi',
      duration: 135,
      releaseDate: new Date('2024-08-15'),
      posterUrl:
        'https://m.media-amazon.com/images/M/MV5BMjFmNTA0OTYtMjExOC00ZjMzLTliNGQtZDk5ZmI1NzgwZmJkXkEyXkFqcGdeQXVyMTUzNTgzNzM0._V1_.jpg',
      rating: 8.1,
      director: 'Amar Kaushik',
      cast: ['Rajkummar Rao', 'Shraddha Kapoor', 'Aparshakti Khurana'],
      isActive: true,
    },
  ]);
  console.log(`🎬 ${movies.length} movies created`);

  // ─── Theatres ──────────────────────────────────────────────────────────────
  const standardTierConfig = [
    { categoryName: 'Recliner', rows: ['A'], seatsPerRow: 10 },
    { categoryName: 'Premium', rows: ['B', 'C'], seatsPerRow: 10 },
    { categoryName: 'Standard', rows: ['D', 'E', 'F'], seatsPerRow: 10 },
  ];

  const theatre1 = await Theatre.create({
    name: 'PVR Cinemas Select CityWalk',
    location: { address: 'A-3, District Centre, Saket', city: 'New Delhi', state: 'Delhi' },
    screens: [
      { screenNumber: 1, totalSeats: 60, tierConfig: standardTierConfig },
      { screenNumber: 2, totalSeats: 60, tierConfig: standardTierConfig },
    ],
    isActive: true,
  });

  const theatre2 = await Theatre.create({
    name: 'INOX Megaplex Andheri',
    location: {
      address: 'Infiniti Mall, Link Road, Andheri West',
      city: 'Mumbai',
      state: 'Maharashtra',
    },
    screens: [
      { screenNumber: 1, totalSeats: 60, tierConfig: standardTierConfig },
      { screenNumber: 2, totalSeats: 60, tierConfig: standardTierConfig },
    ],
    isActive: true,
  });
  console.log('🏛️  2 theatres created');

  // ─── Shows (for next 3 days) ───────────────────────────────────────────────
  const showsToCreate = [];
  for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
    const showDate = new Date();
    showDate.setDate(showDate.getDate() + dayOffset + 1);

    showsToCreate.push(
      {
        movie: movies[0]._id,
        theatre: theatre1._id,
        screenNumber: 1,
        showTime: new Date(new Date(showDate).setHours(10, 0, 0, 0)),
        categoryPricing: { Recliner: 500, Premium: 300, Standard: 200 },
      },
      {
        movie: movies[0]._id,
        theatre: theatre1._id,
        screenNumber: 1,
        showTime: new Date(new Date(showDate).setHours(14, 30, 0, 0)),
        categoryPricing: { Recliner: 550, Premium: 350, Standard: 250 },
      },
      {
        movie: movies[1]._id,
        theatre: theatre1._id,
        screenNumber: 2,
        showTime: new Date(new Date(showDate).setHours(11, 0, 0, 0)),
        categoryPricing: { Recliner: 400, Premium: 250, Standard: 150 },
      },
      {
        movie: movies[2]._id,
        theatre: theatre2._id,
        screenNumber: 1,
        showTime: new Date(new Date(showDate).setHours(13, 0, 0, 0)),
        categoryPricing: { Recliner: 600, Premium: 400, Standard: 300 },
      },
      {
        movie: movies[3]._id,
        theatre: theatre2._id,
        screenNumber: 2,
        showTime: new Date(new Date(showDate).setHours(20, 30, 0, 0)),
        categoryPricing: { Recliner: 450, Premium: 300, Standard: 200 },
      }
    );
  }

  for (const showData of showsToCreate) {
    await Show.create({ ...showData, seats: generateSeatMap(standardTierConfig) });
  }
  console.log(`📅 ${showsToCreate.length} shows created`);

  console.log('\n✨ Seeding complete!');
  console.log('─────────────────────────────────────────');
  console.log(`🔐 Admin login: ${SEED_ADMIN_EMAIL}`);
  console.log('🌐 Frontend:    http://localhost:5173');
  console.log('🚀 Backend:     http://localhost:5000');
  console.log('─────────────────────────────────────────\n');
};

seed()
  .catch((err) => {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
