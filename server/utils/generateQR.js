const QRCode = require('qrcode');
const jwt = require('jsonwebtoken');

/**
 * Generates the secure JWT token for a ticket.
 */
const generateTicketToken = (bookingId, userId) => {
  return jwt.sign(
    { bookingId, userId, type: 'movie-ticket' },
    process.env.TICKET_JWT_SECRET,
    { expiresIn: '30d', issuer: 'quickshow', audience: 'theatre-admin' }
  );
};

/**
 * Generates a QR code as a Base64 data URL string.
 * The QR code encodes booking information for ticket verification.
 *
 * @param {string} bookingId - The MongoDB booking document ID
 * @param {string} userId - The MongoDB user document ID
 * @returns {Promise<string>} - Base64 PNG data URL of the QR code
 */
const generateQRCode = async (bookingId, userId) => {
  try {
    const ticketToken = generateTicketToken(bookingId, userId);

    const qrData = `${process.env.CLIENT_URL}/verify-ticket?token=${ticketToken}`;

    // Generate as data URL (base64 PNG) - easy to embed in HTML/email
    const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 2,
      color: {
        dark: '#1a1a2e',
        light: '#ffffff',
      },
    });

    return qrCodeDataUrl;
  } catch (error) {
    console.error('QR Code generation failed:', error);
    throw new Error('Failed to generate QR code');
  }
};

module.exports = { generateQRCode, generateTicketToken };
