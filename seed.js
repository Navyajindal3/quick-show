/**
 * Seed Script — Run once to create:
 *   - Admin user (admin@quickshow.com / admin123)
 *   - Sample movies (3 popular films)
 *   - Sample theatre (2 screens)
 *   - Sample shows (linked to movie + theatre)
 *
 * Usage: node server/seed.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

// 1. Fix the path: just look in the current folder for .env
dotenv.config();

// 2. Fix the paths: remove '/server' since we are already in the server folder
const User = require('./models/User');
const Movie = require('./models/Movie');
const Theatre = require('./models/Theatre');
const Show = require('./models/Show');

const generateSeatMap = (rows = 6, cols = 10) => {
  const rowLabels = 'ABCDEF';
  const seatMap = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 1; c <= cols; c++) {
      seatMap[`${rowLabels[r]}${c}`] = 'available';
    }
  }
  return seatMap;
};

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  // ─── Admin User ────────────────────────────────────────
  const existingAdmin = await User.findOne({ email: 'admin@quickshow.com' });
  if (!existingAdmin) {
    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@quickshow.com',
      password: 'admin123',
      role: 'admin',
    });
    console.log('👤 Admin created:', admin.email);
  } else {
    console.log('👤 Admin already exists');
  }

  // ─── Movies ────────────────────────────────────────────
  const movies = await Movie.insertMany([
    {
      title: 'Kalki 2898-AD',
      description: 'A sci-fi mythological action epic set in the futuristic city of Kasi. When an ancient warrior is reborn, the fate of humanity changes forever.',
      genre: ['Action', 'Sci-Fi', 'Mythology'],
      language: 'Hindi',
      duration: 180,
      releaseDate: new Date('2024-06-27'),
      posterUrl: 'https://m.media-amazon.com/images/M/MV5BNGUzNDY4ZmItMzYyOC00ODA5LWI3NTEtMmQ4YjJlODRmY2UxXkEyXkFqcGdeQXVyMTUzNTgzNzM0._V1_.jpg',
      trailerUrl: 'https://www.youtube.com/watch?v=9hkDXXU1bos',
      rating: 7.4,
      director: 'Nag Ashwin',
      cast: ['Prabhas', 'Deepika Padukone', 'Amitabh Bachchan', 'Kamal Haasan'],
      isActive: true,
    },
    {
      title: 'Animal',
      description: 'A son goes to extreme lengths to protect his family empire after an attempt on his father\'s life. A visceral and intense family saga.',
      genre: ['Action', 'Drama', 'Thriller'],
      language: 'Hindi',
      duration: 202,
      releaseDate: new Date('2023-12-01'),
      posterUrl: 'https://m.media-amazon.com/images/M/MV5BMjI4ZDI5ZmQtZGNjYi00Y2E4LWJhZGQtMDc2MzA3YzBmYTkwXkEyXkFqcGdeQXVyMTUzNTgzNzM0._V1_FMjpg_UX1000_.jpg',
      trailerUrl: 'https://www.youtube.com/watch?v=oP6n-MiJOgk',
      rating: 6.5,
      director: 'Sandeep Reddy Vanga',
      cast: ['Ranbir Kapoor', 'Rashmika Mandanna', 'Anil Kapoor', 'Bobby Deol'],
      isActive: true,
    },
    {
      title: 'Pushpa 2: The Rule',
      description: 'Pushpa Raj returns stronger than ever, ruling the red sandalwood smuggling trade while facing powerful enemies who want him gone.',
      genre: ['Action', 'Drama', 'Crime'],
      language: 'Hindi',
      duration: 190,
      releaseDate: new Date('2024-12-05'),
      posterUrl: 'https://m.media-amazon.com/images/M/MV5BNTNiNzY0NjctNTQ4ZS00ZGZiLTk2ODktMjQ3YWFiN2Q2MjkzXkEyXkFqcGdeQXVyMTUzNTgzNzM0._V1_.jpg',
      trailerUrl: 'https://www.youtube.com/watch?v=vwBlJNBGrVk',
      rating: 7.9,
      director: 'Sukumar',
      cast: ['Allu Arjun', 'Rashmika Mandanna', 'Fahadh Faasil'],
      isActive: true,
    },
    {
      title: 'Stree 2',
      description: 'The residents of Chanderi face a new supernatural threat, and the legend of Stree takes a terrifying new turn.',
      genre: ['Horror', 'Comedy'],
      language: 'Hindi',
      duration: 135,
      releaseDate: new Date('2024-08-15'),
      posterUrl: 'https://m.media-amazon.com/images/M/MV5BMjFmNTA0OTYtMjExOC00ZjMzLTliNGQtZDk5ZmI1NzgwZmJkXkEyXkFqcGdeQXVyMTUzNTgzNzM0._V1_.jpg',
      trailerUrl: 'https://www.youtube.com/watch?v=kexM7Hb1yEM',
      rating: 8.1,
      director: 'Amar Kaushik',
      cast: ['Rajkummar Rao', 'Shraddha Kapoor', 'Aparshakti Khurana'],
      isActive: true,
    },
  ]);
  console.log(`🎬 ${movies.length} movies seeded`);

  // ─── Theatre ────────────────────────────────────────────
  const theatre = await Theatre.create({
    name: 'PVR Cinemas Select CityWalk',
    location: { address: 'Select CityWalk Mall, A-3, District Centre, Saket', city: 'New Delhi', state: 'Delhi' },
    screens: [
      { screenNumber: 1, totalSeats: 60 },
      { screenNumber: 2, totalSeats: 60 },
    ],
    isActive: true,
  });
  console.log('🏛️ Theatre seeded:', theatre.name);

  // ─── Shows ──────────────────────────────────────────────
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const showsData = [
    { movie: movies[0]._id, theatre: theatre._id, screenNumber: 1, showTime: new Date(tomorrow.setHours(10, 0, 0, 0)), ticketPrice: 250 },
    { movie: movies[0]._id, theatre: theatre._id, screenNumber: 1, showTime: new Date(new Date(tomorrow).setHours(14, 30, 0, 0)), ticketPrice: 300 },
    { movie: movies[1]._id, theatre: theatre._id, screenNumber: 2, showTime: new Date(new Date(tomorrow).setHours(11, 0, 0, 0)), ticketPrice: 200 },
    { movie: movies[2]._id, theatre: theatre._id, screenNumber: 1, showTime: new Date(new Date(tomorrow).setHours(18, 0, 0, 0)), ticketPrice: 350 },
    { movie: movies[3]._id, theatre: theatre._id, screenNumber: 2, showTime: new Date(new Date(tomorrow).setHours(20, 30, 0, 0)), ticketPrice: 280 },
  ];

  for (const showData of showsData) {
    await Show.create({ ...showData, seats: generateSeatMap(6, 10) });
  }
  console.log(`📅 ${showsData.length} shows seeded`);

  console.log('\n✨ Seeding complete!');
  console.log('─────────────────────────────────');
  console.log('Admin login: admin@quickshow.com / admin123');
  console.log('─────────────────────────────────\n');

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
