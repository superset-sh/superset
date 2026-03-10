import { Resend } from 'resend';
import type { EmailProvider, SendEmailOptions, SendEmailResult } from '../types';

/**
 * Resend Email Provider
 *
 * https://resend.com/docs
 */
export class ResendProvider implements EmailProvider {
  private client: Resend;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is required');
    }

    this.client = new Resend(apiKey);
  }

  async send(options: SendEmailOptions): Promise<SendEmailResult> {
    const { to, subject, html, from } = options;

    try {
      const result = await this.client.emails.send({
        from: from || process.env.EMAIL_FROM || 'Atlas <noreply@atlas.com>',
        to,
        subject,
        html,
      });

      if (result.error) {
        throw new Error(`Resend API error: ${result.error.message}`);
      }

      return {
        messageId: result.data?.id || '',
        success: true,
      };
    } catch (error) {
      console.error('[ResendProvider] Send failed:', error);
      throw error;
    }
  }
}
