/**
 * Email Service for Manager Log Notifications
 *
 * Sends email via Mailgun's HTTP API.
 *
 * Required environment variables:
 * - MAILGUN_API_KEY: Mailgun private API key
 * - MAILGUN_DOMAIN: Mailgun sending domain (e.g. mail.membermanager.club)
 * - FROM_EMAIL: Sender address (e.g. noreply@mail.membermanager.club)
 */

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
const FROM_EMAIL = process.env.FROM_EMAIL;

/**
 * Log Mailgun configuration status at startup
 */
export function logEmailConfigStatus(): void {
  const missing: string[] = [];
  if (!MAILGUN_API_KEY) missing.push('MAILGUN_API_KEY');
  if (!MAILGUN_DOMAIN) missing.push('MAILGUN_DOMAIN');
  if (!FROM_EMAIL) missing.push('FROM_EMAIL');

  if (missing.length > 0) {
    console.log(`[Email] Mailgun not configured. Missing: ${missing.join(', ')}`);
    console.log('[Email] Notifications will be logged but not sent until Mailgun is configured.');
  } else {
    console.log(`[Email] Mailgun configured - Domain: ${MAILGUN_DOMAIN}, From: ${FROM_EMAIL}`);
  }
}

/**
 * Checks if email notifications are configured
 */
export function isEmailConfigured(): boolean {
  return !!(MAILGUN_API_KEY && MAILGUN_DOMAIN && FROM_EMAIL);
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

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN || !FROM_EMAIL) {
    return { success: false, message: 'Mailgun not configured' };
  }

  try {
    const form = new FormData();
    form.append('from', `Manager Log <${FROM_EMAIL}>`);
    form.append('to', recipients.join(','));
    form.append('subject', subject);
    form.append('html', htmlBody);

    const credentials = Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64');
    const url = `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
      },
      body: form,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Mailgun error ${response.status}:`, errorText);
      return { success: false, message: `Mailgun error: ${response.status} ${errorText}` };
    }

    const result = await response.json() as { id?: string; message?: string };
    console.log(`Email notification sent via Mailgun to ${recipients.length} recipient(s). ID: ${result.id}`);
    return { success: true, message: `Sent to ${recipients.length} recipient(s)` };
  } catch (error) {
    console.error('Failed to send email via Mailgun:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to send email',
    };
  }
}
