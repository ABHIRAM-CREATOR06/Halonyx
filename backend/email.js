const nodemailer = require('nodemailer');
const crypto = require('crypto');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
});

function generateVerificationToken() {
    return crypto.randomBytes(32).toString('hex');
}

function sendVerificationEmail(email, token) {
    const verificationUrl = `http://localhost:3000/verify?token=${token}`;
    const mailOptions = {
        from: process.env.GMAIL_USER,
        to: email,
        subject: 'Verify your account for Secure Messaging App',
        html: `
            <p>Welcome to the Secure Messaging App!</p>
            <p>Please click the link below to verify your email and complete your registration:</p>
            <a href="${verificationUrl}">Verify Email</a>
            <p>If you did not request this, please ignore this email.</p>
        `
    };
    return transporter.sendMail(mailOptions);
}

module.exports = { sendVerificationEmail, generateVerificationToken };