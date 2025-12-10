/**
 * Email Service for Manager Log Notifications
 * 
 * Simple SMTP-based email sending using nodemailer.
 * 
 * Configuration via environment variables:
 * - SMTP_HOST: SMTP server hostname
 * - SMTP_PORT: SMTP server port (default: 587)
 * - SMTP_USER: SMTP authentication username
 * - SMTP_PASSWORD: SMTP authentication password
 * - FROM_EMAIL: Sender email address (defaults to SMTP_USER)
 */

import nodemailer from 'nodemailer';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const FROM_EMAIL = process.env.FROM_EMAIL || SMTP_USER;

/**
 * Creates a configured nodemailer transporter for sending emails.
 */
function createTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
  });
}

/**
 * Checks if email notifications are configured
 */
export function isEmailConfigured(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASSWORD);
}

/**
 * Send a notification email with the given subject, HTML body, and recipients.
 * 
 * @param subject - Email subject line
 * @param htmlBody - HTML content for the email body
 * @param recipients - Array of email addresses
 */
export async function sendLogNotificationEmail(
  subject: string,
  htmlBody: string,
  recipients: string[]
): Promise<{ success: boolean; message: string }> {
  if (!recipients.length) {
    return { success: false, message: 'No recipients specified' };
  }

  const transporter = createTransporter();
  if (!transporter) {
    return { success: false, message: 'SMTP not configured' };
  }

  try {
    await transporter.sendMail({
      from: `"Manager Log" <${FROM_EMAIL}>`,
      to: recipients.join(','),
      subject,
      html: htmlBody,
    });

    console.log(`Email notification sent to ${recipients.length} recipient(s)`);
    return { success: true, message: `Sent to ${recipients.length} recipient(s)` };
  } catch (error) {
    console.error('Failed to send email notification:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Failed to send email' 
    };
  }
}
