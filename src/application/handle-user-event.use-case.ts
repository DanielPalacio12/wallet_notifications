import { ProcessedEventRepositoryPort } from '../domain/ports/processed-event-repository.port';
import { UserEvent } from '../domain/user-event';
import {
  SendEmailNotificationResult,
  SendEmailNotificationUseCase,
} from './send-email-notification.use-case';
import { buildUserEmail } from './user-email.templates';

export type HandleUserEventResult =
  // El evento no trae email (p. ej. USER_DELETED solo con id): no hay a quién escribir.
  | { status: 'skipped' }
  | { status: 'duplicate' }
  | {
      status: 'processed';
      delivery: SendEmailNotificationResult;
      // No se pudo registrar el eventId; el correo se envió igual para no perderlo.
      idempotencyError?: unknown;
    };

// Caso de uso: procesar un evento de Users una sola vez y enviar su correo.
export class HandleUserEventUseCase {
  constructor(
    private readonly processedEvents: ProcessedEventRepositoryPort,
    private readonly sendEmailNotification: SendEmailNotificationUseCase,
  ) {}

  async execute(event: UserEvent, topic: string): Promise<HandleUserEventResult> {
    const to = event.payload.email;
    if (!to) return { status: 'skipped' };

    let idempotencyError: unknown;

    try {
      const isNew = await this.processedEvents.markAsProcessed(event.eventId, topic);
      if (!isNew) return { status: 'duplicate' };
    } catch (err) {
      idempotencyError = err;
    }

    const delivery = await this.sendEmailNotification.execute(buildUserEmail(event, to), topic);
    return { status: 'processed', delivery, idempotencyError };
  }
}
