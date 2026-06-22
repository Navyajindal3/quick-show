require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Movie = require('../models/Movie');

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const MONGODB_URI = process.env.MONGO_URI;

async function importMovies() {
  if (!TMDB_API_KEY) {
    console.error('Error: TMDB_API_KEY is not defined in .env');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB connected.');

    // WIPE OLD DATA so we don't have duplicates with placeholder data
    console.log('Clearing old movies from the database...');
    await Movie.deleteMany({});
    console.log('Database cleared.');

    console.log('Fetching movies from TMDB (Now Playing)...');
    const response = await fetch(`https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_API_KEY}&language=en-US&page=1`);

    if (!response.ok) throw new Error('Failed to fetch TMDB Now Playing');

    const data = await response.json();
    const tmdbMovies = data.results || [];

    console.log(`Fetched ${tmdbMovies.length} basic movies. Fetching deep details for each...`);

    const moviesToInsert = [];

    // Loop through each movie and fetch its detailed data (Runtime, Cast, Director)
    for (const tmdb of tmdbMovies) {
      const detailResponse = await fetch(`https://api.themoviedb.org/3/movie/${tmdb.id}?api_key=${TMDB_API_KEY}&append_to_response=credits`);
      const details = await detailResponse.json();

      // Extract exact data
      const genres = details.genres ? details.genres.map(g => g.name) : ['Unknown'];
      const duration = details.runtime || 120; // Exact runtime in minutes

      // Find the Director from the crew array
      const directorObj = details.credits?.crew?.find(member => member.job === 'Director');
      const director = directorObj ? directorObj.name : 'Unknown Director';

      // Get the top 4 billed actors
      const cast = details.credits?.cast ? details.credits.cast.slice(0, 4).map(actor => actor.name) : [];

      const movieData = {
        title: details.title,
        description: details.overview || 'No description available.',
        genre: genres,
        language: details.original_language === 'hi' ? 'Hindi' : 'English',
        duration: duration,
        releaseDate: details.release_date ? new Date(details.release_date) : new Date(),
        posterUrl: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : 'https://placehold.co/500x750',
        rating: details.vote_average || 0,
        cast: cast,
        director: director,
        isActive: true,
      };

      moviesToInsert.push(movieData);
      console.log(`Processed detailed data for: ${details.title}`);
    }

    if (moviesToInsert.length > 0) {
      console.log(`Inserting ${moviesToInsert.length} heavily detailed movies...`);
      await Movie.insertMany(moviesToInsert);
      console.log('✅ Successfully inserted all movies.');
    }

    console.log('🎉 Deep Import complete.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error importing movies:', error.message);
    process.exit(1);
  }
}

importMovies();