const Movie = require('../models/Movie');

const syncMovies = async () => {
  const TMDB_API_KEY = process.env.TMDB_API_KEY;

  if (!TMDB_API_KEY) {
    console.error('❌ Error: TMDB_API_KEY is not defined in .env. Skipping movie sync.');
    return;
  }

  try {
    console.log('🎬 Fetching latest movies from TMDB (Now Playing)...');
    const response = await fetch(`https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_API_KEY}&language=en-US&page=1`);

    if (!response.ok) throw new Error('Failed to fetch TMDB Now Playing');

    const data = await response.json();
    const tmdbMovies = data.results || [];

    console.log(`Fetched ${tmdbMovies.length} basic movies. Upserting details for each...`);

    let newCount = 0;
    let updatedCount = 0;

    // Loop through each movie and fetch its detailed data (Runtime, Cast, Director)
    for (const tmdb of tmdbMovies) {
      try {
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

        // Use Upsert to either update an existing movie by title or insert a new one
        const result = await Movie.findOneAndUpdate(
          { title: movieData.title },
          { $set: movieData },
          { upsert: true, new: false } 
        );

        if (!result) {
          newCount++;
        } else {
          updatedCount++;
        }
      } catch (err) {
        console.error(`Failed to process movie ${tmdb.id}:`, err.message);
      }
    }

    console.log(`✅ Movie sync complete. Added ${newCount} new movies, updated ${updatedCount} existing movies.`);
  } catch (error) {
    console.error('❌ Error synchronizing movies:', error.message);
  }
};

module.exports = { syncMovies };
