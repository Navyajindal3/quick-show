/**
 * Seed Script — Run once to bootstrap the database.
 * Creates: Admin user, 4 sample movies, 1 theatre, 5 shows.
 *
 * Usage (from /server directory): node seed.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config(); // Loads .env from current directory (server/)

const User = require('./models/User');
const Movie = require('./models/Movie');
const Theatre = require('./models/Theatre');
const Show = require('./models/Show');

const generateSeatMap = (rows = 6, cols = 10) => {
  const rowLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').slice(0, rows);
  const seatMap = {};
  for (const row of rowLabels) {
    for (let c = 1; c <= cols; c++) {
      seatMap[`${row}${c}`] = 'available';
    }
  }
  return seatMap;
};

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  // ─── Admin User ────────────────────────────────────────────────────────
  const existingAdmin = await User.findOne({ email: 'admin@quickshow.com' });
  if (!existingAdmin) {
    await User.create({
      name: 'Admin User',
      email: 'admin@quickshow.com',
      password: 'admin123',
      role: 'admin',
    });
    console.log('👤 Admin user created: admin@quickshow.com / admin123');
  } else {
    console.log('👤 Admin already exists, skipping...');
  }

  // ─── Clear existing movies/theatres/shows ─────────────────────────────
  await Movie.deleteMany({});
  await Theatre.deleteMany({});
  await Show.deleteMany({});
  console.log('🗑️  Cleared existing movies, theatres, shows');

  // ─── Movies ────────────────────────────────────────────────────────────
  const movies = await Movie.insertMany([
    {
      title: 'Kalki 2898-AD',
      description: 'A sci-fi mythological action epic set in the futuristic city of Kasi. When an ancient warrior is reborn, the fate of humanity changes forever in this visually stunning spectacle.',
      genre: ['Action', 'Sci-Fi', 'Mythology'],
      language: 'Hindi',
      duration: 180,
      releaseDate: new Date('2024-06-27'),
      posterUrl: 'https://m.media-amazon.com/images/M/MV5BNGUzNDY4ZmItMzYyOC00ODA5LWI3NTEtMmQ4YjJlODRmY2UxXkEyXkFqcGdeQXVyMTUzNTgzNzM0._V1_.jpg',
      rating: 7.4,
      director: 'Nag Ashwin',
      cast: ['Prabhas', 'Deepika Padukone', 'Amitabh Bachchan', 'Kamal Haasan'],
      isActive: true,
    },
    {
      title: 'Animal',
      description: 'A son goes to extreme lengths to protect his family empire after an attempt on his father\'s life. A raw, visceral tale of love, power, and revenge.',
      genre: ['Action', 'Drama', 'Thriller'],
      language: 'Hindi',
      duration: 202,
      releaseDate: new Date('2023-12-01'),
      posterUrl: 'https://m.media-amazon.com/images/M/MV5BMjI4ZDI5ZmQtZGNjYi00Y2E4LWJhZGQtMDc2MzA3YzBmYTkwXkEyXkFqcGdeQXVyMTUzNTgzNzM0._V1_FMjpg_UX1000_.jpg',
      rating: 6.5,
      director: 'Sandeep Reddy Vanga',
      cast: ['Ranbir Kapoor', 'Rashmika Mandanna', 'Anil Kapoor', 'Bobby Deol'],
      isActive: true,
    },
    {
      title: 'Pushpa 2: The Rule',
      description: 'Pushpa Raj returns stronger than ever, ruling the red sandalwood smuggling trade while facing powerful enemies who want him destroyed.',
      genre: ['Action', 'Drama', 'Crime'],
      language: 'Hindi',
      duration: 190,
      releaseDate: new Date('2024-12-05'),
      posterUrl: 'https://m.media-amazon.com/images/M/MV5BNTNiNzY0NjctNTQ4ZS00ZGZiLTk2ODktMjQ3YWFiN2Q2MjkzXkEyXkFqcGdeQXVyMTUzNTgzNzM0._V1_.jpg',
      rating: 7.9,
      director: 'Sukumar',
      cast: ['Allu Arjun', 'Rashmika Mandanna', 'Fahadh Faasil'],
      isActive: true,
    },
    {
      title: 'Stree 2',
      description: 'The residents of Chanderi face a terrifying new supernatural threat. The legend of Stree evolves in this hilarious horror-comedy sequel.',
      genre: ['Horror', 'Comedy'],
      language: 'Hindi',
      duration: 135,
      releaseDate: new Date('2024-08-15'),
      posterUrl: 'https://m.media-amazon.com/images/M/MV5BMjFmNTA0OTYtMjExOC00ZjMzLTliNGQtZDk5ZmI1NzgwZmJkXkEyXkFqcGdeQXVyMTUzNTgzNzM0._V1_.jpg',
      rating: 8.1,
      director: 'Amar Kaushik',
      cast: ['Rajkummar Rao', 'Shraddha Kapoor', 'Aparshakti Khurana', 'Tamannaah Bhatia'],
      isActive: true,
    },
  ]);
  console.log(`🎬 ${movies.length} movies created`);

  // ─── Theatres ──────────────────────────────────────────────────────────
  const theatre1 = await Theatre.create({
    name: 'PVR Cinemas Select CityWalk',
    location: { address: 'A-3, District Centre, Saket', city: 'New Delhi', state: 'Delhi' },
    screens: [
      { screenNumber: 1, totalSeats: 60 },
      { screenNumber: 2, totalSeats: 60 },
    ],
    isActive: true,
  });

  const theatre2 = await Theatre.create({
    name: 'INOX Megaplex Andheri',
    location: { address: 'Infiniti Mall, Link Road, Andheri West', city: 'Mumbai', state: 'Maharashtra' },
    screens: [
      { screenNumber: 1, totalSeats: 60 },
      { screenNumber: 2, totalSeats: 60 },
    ],
    isActive: true,
  });
  console.log('🏛️  2 theatres created');

  // ─── Shows (for next 3 days) ───────────────────────────────────────────
  const showsToCreate = [];
  for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
    const showDate = new Date();
    showDate.setDate(showDate.getDate() + dayOffset + 1);

    showsToCreate.push(
      { movie: movies[0]._id, theatre: theatre1._id, screenNumber: 1, showTime: new Date(showDate.setHours(10, 0, 0, 0)), ticketPrice: 250 },
      { movie: movies[0]._id, theatre: theatre1._id, screenNumber: 1, showTime: new Date(new Date(showDate).setHours(14, 30, 0, 0)), ticketPrice: 300 },
      { movie: movies[1]._id, theatre: theatre1._id, screenNumber: 2, showTime: new Date(new Date(showDate).setHours(11, 0, 0, 0)), ticketPrice: 200 },
      { movie: movies[2]._id, theatre: theatre2._id, screenNumber: 1, showTime: new Date(new Date(showDate).setHours(13, 0, 0, 0)), ticketPrice: 350 },
      { movie: movies[3]._id, theatre: theatre2._id, screenNumber: 2, showTime: new Date(new Date(showDate).setHours(20, 30, 0, 0)), ticketPrice: 280 },
      { movie: movies[3]._id, theatre: theatre1._id, screenNumber: 2, showTime: new Date(new Date(showDate).setHours(18, 0, 0, 0)), ticketPrice: 260 },
    );
  }

  for (const showData of showsToCreate) {
    await Show.create({ ...showData, seats: generateSeatMap(6, 10) });
  }
  console.log(`📅 ${showsToCreate.length} shows created`);

  console.log('\n✨ Seeding complete!');
  console.log('─────────────────────────────────────────');
  console.log('🔐 Admin Login: admin@quickshow.com / admin123');
  console.log('🌐 Frontend:   http://localhost:5173');
  console.log('🚀 Backend:    http://localhost:5000');
  console.log('─────────────────────────────────────────\n');

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
