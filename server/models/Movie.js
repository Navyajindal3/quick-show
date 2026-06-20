const mongoose = require('mongoose');

/**
 * Movie Schema
 * Stores all details about a movie that can be shown in theatres
 */
const movieSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Movie title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Movie description is required'],
    },
    genre: {
      type: [String], // e.g., ['Action', 'Drama']
      required: [true, 'Genre is required'],
    },
    language: {
      type: String,
      required: [true, 'Language is required'],
      default: 'English',
    },
    duration: {
      type: Number, // Duration in minutes
      required: [true, 'Duration is required'],
    },
    releaseDate: {
      type: Date,
      required: [true, 'Release date is required'],
    },
    posterUrl: {
      type: String,
      required: [true, 'Poster URL is required'],
    },
    trailerUrl: {
      type: String,
      default: '',
    },
    rating: {
      type: Number,
      min: 0,
      max: 10,
      default: 0,
    },
    cast: {
      type: [String],
      default: [],
    },
    director: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true, // Only active movies are shown on home page
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Movie', movieSchema);
