'use strict';

/**
 * Ticket Token & QR Code Generation
 * ====================================
 * Generates signed JWT tokens for movie tickets and QR code images.
 *
 * The ticket token is a SIGNED JWT (not encrypted).
 * It is tamper-evident: any modification to the payload invalidates the signature.
 * It is NOT confidential: the payload can be decoded without the secret.
 *
 * Payload contains only the minimum required for verification:
 *   - bookingId: to look up the booking record
 *   - userId: to verify ownership
 *   - type: to distinguish from other JWTs in the system
 *
 * The QR code encodes the verification URL with the signed token as a query param.
 * Theatre admins scan the QR code to open the verification page.
 */

const QRCode = require('qrcode');
const jwt = require('jsonwebtoken');

/**
 * Generate a signed JWT for a ticket.
 * The token is tamper-evident and expires after 30 days.
 *
 * @param {string|ObjectId} bookingId
 * @param {string|ObjectId} userId
 * @returns {string} signed JWT
 */
const generateTicketToken = (bookingId, userId) => {
  const secret = process.env.TICKET_JWT_SECRET;
  if (!secret) throw new Error('TICKET_JWT_SECRET is not configured');

  return jwt.sign(
    {
      // Minimum payload — no email, no payment data, no secrets
      bookingId: bookingId.toString(),
      userId: userId.toString(),
      type: 'movie-ticket',
    },
    secret,
    {
      expiresIn: '30d',
      issuer: 'quickshow',
      audience: 'theatre-admin',
    }
  );
};

/**
 * Generate a QR code PNG buffer for a ticket token.
 * The QR data is a verification URL (not the raw token).
 *
 * @param {string} ticketToken - signed JWT from generateTicketToken()
 * @returns {Promise<Buffer>} PNG buffer
 */
const generateQRBuffer = async (ticketToken) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const qrData = `${clientUrl}/verify-ticket?token=${ticketToken}`;

  const qrBuffer = await QRCode.toBuffer(qrData, {
    width: 300,
    margin: 2,
    color: {
      dark: '#1a1a2e',
      light: '#ffffff',
    },
  });

  return qrBuffer;
};

module.exports = { generateQRBuffer, generateTicketToken };
