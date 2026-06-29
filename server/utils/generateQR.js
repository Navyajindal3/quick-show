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
 * Generates a QR code as a raw PNG Buffer.
 * The QR code encodes booking information for ticket verification.
 *
 * @param {string} ticketToken - The secure ticket token
 * @returns {Promise<Buffer>} - PNG Buffer of the QR code
 */
const generateQRBuffer = async (ticketToken) => {
  try {
    const qrData = `${process.env.CLIENT_URL}/verify-ticket?token=${ticketToken}`;

    // Generate as raw Buffer
    const qrBuffer = await QRCode.toBuffer(qrData, {
      width: 300,
      margin: 2,
      color: {
        dark: '#1a1a2e',
        light: '#ffffff',
      },
    });

    return qrBuffer;
  } catch (error) {
    console.error('QR Code Buffer generation failed:', error);
    throw new Error('Failed to generate QR code buffer');
  }
};

module.exports = { generateQRBuffer, generateTicketToken };
