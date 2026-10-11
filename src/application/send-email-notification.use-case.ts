import { EmailMessage } from '../domain/email-message';
import { Notification } from '../domain/notification';
import { MailerPort } from '../domain/ports/mailer.port';
import { NotificationRepositoryPort } from '../domain/ports/notification-repository.port';

export interface SendEmailNotificationResult {
  notification: Notification;
  // Error al enviar el correo (Paso-4).
  deliveryError?: unknown;
  // Error al guardar/actualizar el historial; no impide el envío.
  persistenceError?: unknown;
}

// Caso de uso: registrar la notificación, enviar el correo y dejar el estado final.
// No depende de Nest, Kafka, nodemailer ni Postgres: solo de los puertos.
export class SendEmailNotificationUseCase {
  constructor(
    private readonly repository: NotificationRepositoryPort,
    private readonly mailer: MailerPort,
  ) {}

  async execute(
    message: EmailMessage,
    topic: string | null,
  ): Promise<SendEmailNotificationResult> {
    const notification = Notification.create(message, topic);
    const result: SendEmailNotificationResult = { notification };

    try {
      notification.assignId(await this.repository.create(notification));
    } catch (err) {
      // Continuamos intentando enviar el correo aunque falle el guardado
      result.persistenceError = err;
    }

    try {
      await this.mailer.send(message);
      notification.markSent();
    } catch (err) {
      notification.markFailed((err as Error)?.message ?? 'unknown error');
      result.deliveryError = err;
    }

    if (notification.id !== null) {
      try {
        await this.repository.updateStatus(notification);
      } catch (err) {
        result.persistenceError = err;
      }
    }

    return result;
  }
}
