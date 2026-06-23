const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendTicketEmail = async (userEmail, { userName, movieName, theatreName, showTime, screenName, seatsList, amountPaid, bookingId }) => {
  try {
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: userEmail,
      subject: `Your Tickets for ${movieName}`,
      html: `<div style="font-family: Arial, sans-serif; background-color: #0A0D14; color: #FFFFFF; max-width: 600px; margin: 0 auto; border-radius: 8px; overflow: hidden;">
  <!-- Header -->
  <div style="background-color: #DC2626; padding: 20px; text-align: center;">
    <h1 style="margin: 0; color: white; font-size: 24px;">🎬 QuickShow</h1>
    <p style="margin: 5px 0 0 0; color: white; font-size: 16px;">Booking Confirmed!</p>
  </div>
  
  <!-- Body -->
  <div style="padding: 30px;">
    <h2 style="margin-top: 0; color: #FFFFFF;">Hi ${userName},</h2>
    <p style="color: #9CA3AF;">Your tickets are confirmed! Here are your booking details:</p>

    <!-- Details Card -->
    <div style="background-color: #1F2232; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse; color: #E5E7EB; font-size: 14px;">
        <tr><td style="padding: 10px 0; color: #9CA3AF; width: 40%;">Movie</td><td style="padding: 10px 0; font-weight: bold;">${movieName}</td></tr>
        <tr><td style="padding: 10px 0; color: #9CA3AF;">Theatre</td><td style="padding: 10px 0; font-weight: bold;">${theatreName}</td></tr>
        <tr><td style="padding: 10px 0; color: #9CA3AF;">Show Time</td><td style="padding: 10px 0; font-weight: bold;">${showTime}</td></tr>
        <tr><td style="padding: 10px 0; color: #9CA3AF;">Screen</td><td style="padding: 10px 0; font-weight: bold;">${screenName}</td></tr>
        <tr><td style="padding: 10px 0; color: #9CA3AF;">Seats</td><td style="padding: 10px 0; font-weight: bold;">${seatsList}</td></tr>
        <tr><td style="padding: 10px 0; color: #9CA3AF;">Amount Paid</td><td style="padding: 10px 0; color: #EF4444; font-weight: bold;">₹${amountPaid}</td></tr>
        <tr><td style="padding: 10px 0; color: #9CA3AF;">Booking ID</td><td style="padding: 10px 0; font-family: monospace;">${bookingId}</td></tr>
      </table>
    </div>

    <!-- QR Code -->
    <div style="text-align: center; margin-top: 30px;">
      <p style="color: #9CA3AF; margin-bottom: 15px;">Show this QR code at the theatre entrance:</p>
      <div style="background-color: white; padding: 15px; display: inline-block; border-radius: 8px;">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${bookingId}" alt="Ticket QR Code" width="200" height="200" style="display: block; border: none;" />
      </div>
      <p style="color: #9CA3AF; font-size: 12px; margin-top: 25px;">Please arrive 15 minutes before the show. Enjoy your movie! 🍿</p>
    </div>
  </div>
</div>`
    });
    console.log(`✅ Ticket email sent via Resend to ${userEmail}`);
  } catch (error) {
    console.error('❌ Email sending failed:', error.message || error);
  }
};

module.exports = { sendTicketEmail };
