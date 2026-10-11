import { Injectable } from '@nestjs/common';
import { EmailMessage } from '../../domain/email-message';
import { MailerPort } from '../../domain/ports/mailer.port';

// "Wallet <no-reply@dominio.com>" -> { name: 'Wallet', email: 'no-reply@dominio.com' }
const parseSender = (from = '') => {
  const match = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  return match ? { name: match[1].trim() || undefined, email: match[2] } : { email: from.trim() };
};

// Adaptador de salida: implementa MailerPort con la API HTTP de Brevo.
// Va por HTTPS, así que funciona aunque el hosting bloquee los puertos SMTP.
@Injectable()
export class BrevoMailerAdapter implements MailerPort {
  async send({ to, subject, body }: EmailMessage) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY!,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: parseSender(process.env.MAIL_FROM),
        to: [{ email: to }],
        subject,
        htmlContent: body,
      }),
    });

    if (!res.ok) {
      throw new Error(`Brevo respondió ${res.status}: ${await res.text()}`);
    }
  }
}
