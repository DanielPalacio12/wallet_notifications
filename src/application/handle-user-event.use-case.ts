import { ProcessedEventRepositoryPort } from '../domain/ports/processed-event-repository.port';
import { UserDirectoryPort } from '../domain/ports/user-directory.port';
import { UserEvent } from '../domain/user-event';
import {
  SendEmailNotificationResult,
  SendEmailNotificationUseCase,
} from './send-email-notification.use-case';
import { buildUserEmail } from './user-email.templates';

export type HandleUserEventResult =
  // El evento no trae email (p. ej. USER_DELETED solo con id): no hay a quién escribir.
  (
    | { status: 'skipped' }
    | { status: 'duplicate' }
    | {
        status: 'processed';
        delivery: SendEmailNotificationResult;
        // No se pudo registrar el eventId; el correo se envió igual para no perderlo.
        idempotencyError?: unknown;
      }
  ) & {
    // No se pudo actualizar el directorio de contactos; no impide el envío.
    directoryError?: unknown;
  };

// Caso de uso: procesar un evento de Users una sola vez y enviar su correo.
// De paso mantiene el directorio userId -> contacto que usan otros eventos.
export class HandleUserEventUseCase {
  constructor(
    private readonly processedEvents: ProcessedEventRepositoryPort,
    private readonly userDirectory: UserDirectoryPort,
    private readonly sendEmailNotification: SendEmailNotificationUseCase,
  ) {}

  async execute(
    event: UserEvent,
    topic: string,
  ): Promise<HandleUserEventResult> {
    const { id, name, email: to } = event.payload;
    if (!to) return { status: 'skipped' };

    // Se guarda aunque el evento sea duplicado: es un upsert y no tiene efectos externos.
    let directoryError: unknown;
    if (event.eventType !== 'USER_DELETED') {
      try {
        await this.userDirectory.save({ userId: id, name, email: to });
      } catch (err) {
        directoryError = err;
      }
    }

    let idempotencyError: unknown;
    try {
      const isNew = await this.processedEvents.markAsProcessed(
        event.eventId,
        topic,
      );
      if (!isNew) return { status: 'duplicate', directoryError };
    } catch (err) {
      idempotencyError = err;
    }

    const delivery = await this.sendEmailNotification.execute(
      buildUserEmail(event, to),
      topic,
    );
    return { status: 'processed', delivery, idempotencyError, directoryError };
  }
}
