/**
 * Email Service for Manager Log Notifications
 * 
 * Provides SMTP-based email sending functionality for notifying recipients
 * when a manager log is submitted. Uses nodemailer for reliable email delivery.
 * 
 * Configuration via environment variables:
 * - SMTP_HOST: SMTP server hostname
 * - SMTP_PORT: SMTP server port (default: 587)
 * - SMTP_USER: SMTP authentication username
 * - SMTP_PASSWORD: SMTP authentication password
 * - FROM_EMAIL: Sender email address (defaults to SMTP_USER)
 * - FROM_NAME: Sender display name (default: "Manager Log")
 */

import nodemailer from 'nodemailer';
import type { ManagerLog } from '@shared/schema';

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const FROM_EMAIL = process.env.FROM_EMAIL || SMTP_USER;
const FROM_NAME = process.env.FROM_NAME || 'Manager Log';

/**
 * Creates a configured nodemailer transporter for sending emails.
 * Returns null if SMTP is not configured.
 */
function createTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    console.warn('SMTP not configured - email notifications disabled');
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
 * Formats a currency value for display
 * Handles both string and number values since sales fields are stored as strings in the database
 */
function formatCurrency(value: string | number | null | undefined): string {
  if (value == null || value === '') return '$0';
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(numValue);
}

/**
 * Generates HTML email body for a manager log notification
 */
export function generateLogEmailHtml(log: ManagerLog, clubName?: string): string {
  const clubDisplay = clubName || log.clubId || 'Club';
  const dateDisplay = log.logDate;
  const dayOfWeek = log.dayOfWeek || '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Manager Log - ${dateDisplay}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background-color: #0d9488; color: white; padding: 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .header p { margin: 8px 0 0; opacity: 0.9; }
    .content { padding: 24px; }
    .section { margin-bottom: 24px; }
    .section-title { font-size: 16px; font-weight: 600; color: #0d9488; margin-bottom: 12px; border-bottom: 2px solid #0d9488; padding-bottom: 4px; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
    .info-label { color: #666; }
    .info-value { font-weight: 500; }
    .sales-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .sales-item { background: #f8f9fa; padding: 12px; border-radius: 8px; text-align: center; }
    .sales-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .sales-value { font-size: 20px; font-weight: 600; color: #0d9488; }
    .sales-total { grid-column: span 2; background: #0d9488; color: white; }
    .sales-total .sales-label { color: rgba(255,255,255,0.8); }
    .sales-total .sales-value { color: white; font-size: 28px; }
    .notes-box { background: #f8f9fa; padding: 16px; border-radius: 8px; border-left: 4px solid #0d9488; }
    .weather-box { background: #e0f2f1; padding: 12px; border-radius: 8px; display: flex; gap: 16px; }
    .weather-item { flex: 1; }
    .weather-label { font-size: 12px; color: #666; }
    .weather-value { font-weight: 500; }
    .footer { background: #f5f5f5; padding: 16px; text-align: center; font-size: 12px; color: #888; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${clubDisplay} - Manager Log</h1>
      <p>${dayOfWeek}, ${dateDisplay}</p>
    </div>
    
    <div class="content">
      <div class="section">
        <div class="section-title">Overview</div>
        <div class="info-row">
          <span class="info-label">Manager</span>
          <span class="info-value">${log.managerName || 'Not specified'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Daily Number</span>
          <span class="info-value">${log.dailyNumber || '-'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Weekly Number</span>
          <span class="info-value">${log.weeklyNumber || '-'}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Sales</div>
        <div class="sales-grid">
          <div class="sales-item">
            <div class="sales-label">Food</div>
            <div class="sales-value">${formatCurrency(log.foodSales)}</div>
          </div>
          <div class="sales-item">
            <div class="sales-label">Bar</div>
            <div class="sales-value">${formatCurrency(log.barSales)}</div>
          </div>
          <div class="sales-item">
            <div class="sales-label">Gaming</div>
            <div class="sales-value">${formatCurrency(log.gamingSales)}</div>
          </div>
          <div class="sales-item sales-total">
            <div class="sales-label">Total Sales</div>
            <div class="sales-value">${formatCurrency(log.totalSales)}</div>
          </div>
        </div>
        ${log.salesNotes ? `
        <div class="notes-box" style="margin-top: 12px;">
          <strong>Sales Notes:</strong> ${log.salesNotes}
        </div>
        ` : ''}
      </div>

      ${log.weather || log.weatherLastYear ? `
      <div class="section">
        <div class="section-title">Weather</div>
        <div class="weather-box">
          ${log.weather ? `
          <div class="weather-item">
            <div class="weather-label">Today</div>
            <div class="weather-value">${log.weather}</div>
          </div>
          ` : ''}
          ${log.weatherLastYear ? `
          <div class="weather-item">
            <div class="weather-label">1 Year Ago</div>
            <div class="weather-value">${log.weatherLastYear}</div>
          </div>
          ` : ''}
        </div>
      </div>
      ` : ''}

      ${log.dailyNotes ? `
      <div class="section">
        <div class="section-title">Daily Notes</div>
        <div class="notes-box">${log.dailyNotes}</div>
      </div>
      ` : ''}
    </div>

    <div class="footer">
      This is an automated notification from the Manager Log system.
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generates plain text version of the email for clients that don't support HTML
 */
export function generateLogEmailText(log: ManagerLog, clubName?: string): string {
  const clubDisplay = clubName || log.clubId || 'Club';
  const lines = [
    `${clubDisplay} - Manager Log`,
    `${log.dayOfWeek || ''}, ${log.logDate}`,
    '',
    'OVERVIEW',
    `Manager: ${log.managerName || 'Not specified'}`,
    `Daily Number: ${log.dailyNumber || '-'}`,
    `Weekly Number: ${log.weeklyNumber || '-'}`,
    '',
    'SALES',
    `Food: ${formatCurrency(log.foodSales)}`,
    `Bar: ${formatCurrency(log.barSales)}`,
    `Gaming: ${formatCurrency(log.gamingSales)}`,
    `Total: ${formatCurrency(log.totalSales)}`,
  ];

  if (log.salesNotes) {
    lines.push('', `Sales Notes: ${log.salesNotes}`);
  }

  if (log.weather || log.weatherLastYear) {
    lines.push('', 'WEATHER');
    if (log.weather) lines.push(`Today: ${log.weather}`);
    if (log.weatherLastYear) lines.push(`1 Year Ago: ${log.weatherLastYear}`);
  }

  if (log.dailyNotes) {
    lines.push('', 'DAILY NOTES', log.dailyNotes);
  }

  return lines.join('\n');
}

/**
 * Sends a manager log notification email to the specified recipients.
 * 
 * @param log - The manager log to include in the notification
 * @param recipients - Array of email addresses to send to
 * @param clubName - Optional club name for display in the email
 * @returns Promise that resolves when email is sent, or rejects on error
 */
export async function sendLogNotification(
  log: ManagerLog,
  recipients: string[],
  clubName?: string
): Promise<{ success: boolean; message: string }> {
  if (!recipients || recipients.length === 0) {
    return { success: false, message: 'No recipients specified' };
  }

  const transporter = createTransporter();
  if (!transporter) {
    return { success: false, message: 'SMTP not configured' };
  }

  const subject = `Manager Log - ${clubName || log.clubId || 'Club'} - ${log.logDate}`;
  const html = generateLogEmailHtml(log, clubName);
  const text = generateLogEmailText(log, clubName);

  try {
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
      to: recipients.join(', '),
      subject,
      text,
      html,
    });

    console.log(`Email notification sent to ${recipients.length} recipient(s) for log ${log.id}`);
    return { success: true, message: `Sent to ${recipients.length} recipient(s)` };
  } catch (error) {
    console.error('Failed to send email notification:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Failed to send email' 
    };
  }
}

/**
 * Checks if email notifications are configured
 */
export function isEmailConfigured(): boolean {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASSWORD);
}
