import { AccountEvent } from '../domain/account-event';
import { ProcessedEventRepositoryPort } from '../domain/ports/processed-event-repository.port';
import { UserDirectoryPort } from '../domain/ports/user-directory.port';
import { buildAccountCreatedEmail } from './account-email.templates';
import {
  SendEmailNotificationResult,
  SendEmailNotificationUseCase,
} from './send-email-notification.use-case';

export type HandleAccountEventResult =
  // No hay contacto para ese userId (el usuario se creó antes de existir el directorio)
  | { status: 'unknown-user' }
  | { status: 'duplicate' }
  | {
      status: 'processed';
      delivery: SendEmailNotificationResult;
      idempotencyError?: unknown;
    };

// Caso de uso: enviar el correo de cuenta creada al dueño de la cuenta.
// El evento de Accounts solo trae userId, así que el email sale del directorio local.
export class HandleAccountEventUseCase {
  constructor(
    private readonly processedEvents: ProcessedEventRepositoryPort,
    private readonly userDirectory: UserDirectoryPort,
    private readonly sendEmailNotification: SendEmailNotificationUseCase,
  ) {}

  async execute(
    event: AccountEvent,
    topic: string,
  ): Promise<HandleAccountEventResult> {
    // Se busca antes de marcar el evento: si no hay contacto, no queda como procesado
    const contact = await this.userDirectory.findById(event.payload.userId);
    if (!contact) return { status: 'unknown-user' };

    let idempotencyError: unknown;
    try {
      const isNew = await this.processedEvents.markAsProcessed(
        event.eventId,
        topic,
      );
      if (!isNew) return { status: 'duplicate' };
    } catch (err) {
      idempotencyError = err;
    }

    const delivery = await this.sendEmailNotification.execute(
      buildAccountCreatedEmail(event.payload, contact),
      topic,
    );
    return { status: 'processed', delivery, idempotencyError };
  }
}
