'use strict';
const { Resend } = require('resend');

const FROM = process.env.EMAIL_FROM || 'Dialed <onboarding@resend.dev>';

let _resend = null;
function getResend() {
  if (!_resend) {
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

async function sendVerificationEmail(toEmail, code) {
  const resend = getResend();
  await resend.emails.send({
    from: FROM,
    to: toEmail,
    subject: 'Your Dialed verification code',
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #0a0a0a; color: #f5f5f5; border-radius: 12px;">
        <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 8px; color: #ffffff;">Verify your email</h1>
        <p style="font-size: 15px; color: #a3a3a3; margin: 0 0 32px;">Enter this code in the Dialed app to confirm your email address.</p>
        <div style="background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px; padding: 24px; text-align: center; margin-bottom: 32px;">
          <span style="font-size: 40px; font-weight: 700; letter-spacing: 12px; color: #34d399;">${code}</span>
        </div>
        <p style="font-size: 13px; color: #737373; margin: 0;">This code expires in 15 minutes. If you didn't create a Dialed account, you can ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendVerificationEmail };
