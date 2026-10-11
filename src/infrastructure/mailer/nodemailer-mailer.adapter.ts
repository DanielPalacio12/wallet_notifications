import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EmailMessage } from '../../domain/email-message';
import { MailerPort } from '../../domain/ports/mailer.port';

// Adaptador de salida: implementa MailerPort con SMTP vía nodemailer.
@Injectable()
export class NodemailerMailerAdapter implements MailerPort {
  private readonly transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  async send({ to, subject, body }: EmailMessage) {
    await this.transporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      html: body,
    });
  }
}
