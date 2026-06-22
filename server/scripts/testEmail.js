require('dotenv').config();
const nodemailer = require('nodemailer');

async function runEmailTest() {
    console.log(`Attempting to log into Gmail as: ${process.env.NODEMAILER_USER}`);

    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.NODEMAILER_USER, // Changed to match your .env
                pass: process.env.NODEMAILER_PASS, // Changed to match your .env
            },
        });

        const info = await transporter.sendMail({
            from: `"QuickShow App" <${process.env.NODEMAILER_USER}>`,
            to: process.env.NODEMAILER_USER,
            subject: '🎬 QuickShow Diagnostic Test',
            text: 'If you are reading this, your NodeMailer configuration is working perfectly!',
        });

        console.log('✅ SUCCESS! Email sent. Message ID:', info.messageId);
        console.log('Go check your inbox (and spam folder)!');

    } catch (error) {
        console.log('❌ FAILED. Here is the exact reason why:');
        console.error(error.message);
    }
}

runEmailTest();