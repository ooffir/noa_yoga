import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailOptions) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || "Yoga Studio <noreply@yogastudio.com>",
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error("Failed to send email:", error);
  }
}

export function bookingConfirmationEmail(
  name: string,
  className: string,
  date: string,
  time: string
) {
  return {
    subject: `Booking Confirmed: ${className}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #587b5b;">Booking Confirmed!</h2>
        <p>Hi ${name},</p>
        <p>Your spot in <strong>${className}</strong> is confirmed.</p>
        <div style="background: #f4f7f4; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Date:</strong> ${date}</p>
          <p style="margin: 4px 0;"><strong>Time:</strong> ${time}</p>
        </div>
        <p style="color: #666; font-size: 14px;">
          You can cancel up to 6 hours before class for a full credit refund.
        </p>
      </div>
    `,
  };
}

export function waitlistPromotionEmail(
  name: string,
  className: string,
  date: string,
  time: string
) {
  return {
    subject: `Spot Available: ${className}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #587b5b;">You're In!</h2>
        <p>Hi ${name},</p>
        <p>A spot opened up in <strong>${className}</strong> and you've been automatically booked!</p>
        <div style="background: #f4f7f4; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Date:</strong> ${date}</p>
          <p style="margin: 4px 0;"><strong>Time:</strong> ${time}</p>
        </div>
      </div>
    `,
  };
}

export function reminderEmail(
  name: string,
  className: string,
  date: string,
  time: string
) {
  return {
    subject: `Reminder: ${className} Tomorrow`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #587b5b;">Class Reminder</h2>
        <p>Hi ${name},</p>
        <p>This is a reminder that you have <strong>${className}</strong> tomorrow.</p>
        <div style="background: #f4f7f4; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Date:</strong> ${date}</p>
          <p style="margin: 4px 0;"><strong>Time:</strong> ${time}</p>
        </div>
        <p style="color: #666; font-size: 14px;">See you on the mat! 🧘</p>
      </div>
    `,
  };
}
