const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendTicketEmail = async (userEmail, bookingDetails) => {
  try {
    const movieTitle = bookingDetails.bookingSnapshot?.movieTitle || 'Movie';
    const theatreName = bookingDetails.bookingSnapshot?.theatreName || 'Theatre';
    const screenNumber = bookingDetails.bookingSnapshot?.screenNumber || '';
    const showTime = bookingDetails.bookingSnapshot?.showTime ? new Date(bookingDetails.bookingSnapshot.showTime).toLocaleString('en-IN') : '';
    const seats = bookingDetails.seatsSelected?.join(', ') || '';
    const qrUrl = bookingDetails.qrCodeUrl || `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${bookingDetails._id}`;

    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: userEmail,
      subject: `Your Tickets for ${movieTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; color: #333;">
          <div style="background-color: #e50914; padding: 20px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 24px;">Booking Confirmed!</h1>
          </div>
          <div style="padding: 30px; border: 1px solid #eaeaea; border-top: none; border-radius: 0 0 8px 8px;">
            <h2 style="color: #111; margin-top: 0;">${movieTitle}</h2>
            <p style="margin: 5px 0;"><strong>Theatre:</strong> ${theatreName} (Screen ${screenNumber})</p>
            <p style="margin: 5px 0;"><strong>Date & Time:</strong> ${showTime}</p>
            <p style="margin: 5px 0;"><strong>Seats:</strong> ${seats}</p>
            
            <div style="text-align: center; margin-top: 40px;">
              <p style="color: #666; font-size: 14px; margin-bottom: 10px;">Show this QR code at the entrance:</p>
              <img src="${qrUrl}" alt="Ticket QR Code" style="width: 200px; height: 200px; border: 4px solid #e50914; border-radius: 8px;" />
            </div>
            
            <p style="text-align: center; color: #888; font-size: 12px; margin-top: 40px;">
              Please arrive 15 minutes before the show. Enjoy your movie! 🍿
            </p>
          </div>
        </div>
      `
    });
    console.log(`✅ Ticket email sent via Resend to ${userEmail}`);
  } catch (error) {
    console.error('❌ Email sending failed:', error.message || error);
  }
};

module.exports = { sendTicketEmail };
