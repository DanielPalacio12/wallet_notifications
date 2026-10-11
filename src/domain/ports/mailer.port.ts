import { EmailMessage } from '../email-message';

// Puerto de salida: cómo se entrega un correo (SMTP, API de proveedor, etc.).
export interface MailerPort {
  send(message: EmailMessage): Promise<void>;
}

export const MAILER = Symbol('MailerPort');
