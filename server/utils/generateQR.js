const QRCode = require('qrcode');
const jwt = require('jsonwebtoken');

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
    const ticketToken = jwt.sign(
      { bookingId, userId },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

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

module.exports = generateQRCode;
