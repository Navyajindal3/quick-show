const nodemailer = require('nodemailer');

/**
 * Creates a Nodemailer transporter using Gmail SMTP.
 * Uses app password for 2FA-enabled Gmail accounts.
 */
const createTransporter = () => {
  return nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.NODEMAILER_USER,
      pass: process.env.NODEMAILER_PASS,
    },
  });
};

/**
 * Sends a booking confirmation email with ticket details and QR code.
 *
 * @param {Object} params
 * @param {string} params.to - Recipient email address
 * @param {string} params.userName - User's display name
 * @param {Object} params.booking - Booking document (populated)
 * @param {string} params.qrCodeDataUrl - Base64 QR code image
 */
const sendBookingConfirmationEmail = async ({ to, userName, booking, qrCodeDataUrl }) => {
  try {
    const transporter = createTransporter();

    const { bookingSnapshot, seatsSelected, totalAmount, _id } = booking;

    const mailOptions = {
      from: `"QuickShow 🎬" <${process.env.NODEMAILER_USER}>`,
      to,
      subject: `🎟️ Your Booking Confirmed - ${bookingSnapshot.movieTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f0f23; color: #fff; border-radius: 12px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #e50914, #b81d24); padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">🎬 QuickShow</h1>
            <p style="margin: 8px 0 0; opacity: 0.9;">Booking Confirmed!</p>
          </div>

          <div style="padding: 30px;">
            <p style="font-size: 18px;">Hi <strong>${userName}</strong>,</p>
            <p>Your tickets are confirmed! Here are your booking details:</p>

            <div style="background: #1a1a2e; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #aaa;">Movie</td>
                  <td style="padding: 8px 0; font-weight: bold;">${bookingSnapshot.movieTitle}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #aaa;">Theatre</td>
                  <td style="padding: 8px 0;">${bookingSnapshot.theatreName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #aaa;">Show Time</td>
                  <td style="padding: 8px 0;">${new Date(bookingSnapshot.showTime).toLocaleString('en-IN')}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #aaa;">Screen</td>
                  <td style="padding: 8px 0;">Screen ${bookingSnapshot.screenNumber}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #aaa;">Seats</td>
                  <td style="padding: 8px 0;"><strong>${seatsSelected.join(', ')}</strong></td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #aaa;">Amount Paid</td>
                  <td style="padding: 8px 0; color: #e50914; font-weight: bold;">₹${totalAmount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #aaa;">Booking ID</td>
                  <td style="padding: 8px 0; font-size: 12px; color: #aaa;">${_id}</td>
                </tr>
              </table>
            </div>

            <div style="text-align: center; margin: 20px 0;">
              <p style="color: #aaa;">Show this QR code at the theatre entrance:</p>
              <img src="${qrCodeDataUrl}" alt="Ticket QR Code" style="width: 200px; height: 200px; border: 4px solid #e50914; border-radius: 8px;" />
            </div>

            <p style="color: #aaa; font-size: 12px; text-align: center; margin-top: 30px;">
              Please arrive 15 minutes before the show. Enjoy your movie! 🍿
            </p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Confirmation email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    // Email failure should NOT block the booking process
    console.error('❌ Email sending failed:', error.message);
  }
};

module.exports = { sendBookingConfirmationEmail };
