import { AccountEvent } from '../domain/account-event';
import { ProcessedEventRepositoryPort } from '../domain/ports/processed-event-repository.port';
import {
  UserContact,
  UserDirectoryPort,
} from '../domain/ports/user-directory.port';
import { buildAccountCreatedEmail } from './account-email.templates';
import {
  SendEmailNotificationResult,
  SendEmailNotificationUseCase,
} from './send-email-notification.use-case';

export type HandleAccountEventResult =
  // No hay contacto para ese userId ni después de esperar
  | { status: 'unknown-user' }
  | { status: 'duplicate' }
  | {
      status: 'processed';
      delivery: SendEmailNotificationResult;
      idempotencyError?: unknown;
    };

export interface ContactLookupOptions {
  attempts: number;
  delayMs: number;
}

// Users y Accounts publican casi al mismo tiempo y los tópicos se consumen en paralelo
// (partitionsConsumedConcurrently en main.ts):
// la cuenta puede llegar antes de que se guarde el contacto. Se espera hasta ~8 s.
const DEFAULT_LOOKUP: ContactLookupOptions = { attempts: 5, delayMs: 2000 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Caso de uso: enviar el correo de cuenta creada al dueño de la cuenta.
// El evento de Accounts solo trae userId, así que el email sale del directorio local.
export class HandleAccountEventUseCase {
  constructor(
    private readonly processedEvents: ProcessedEventRepositoryPort,
    private readonly userDirectory: UserDirectoryPort,
    private readonly sendEmailNotification: SendEmailNotificationUseCase,
    private readonly lookup: ContactLookupOptions = DEFAULT_LOOKUP,
  ) {}

  // Lanza si la consulta sigue fallando: así Kafka no confirma el mensaje y lo reintenta.
  async execute(
    event: AccountEvent,
    topic: string,
  ): Promise<HandleAccountEventResult> {
    // Se busca antes de marcar el evento: si no hay contacto, no queda como procesado
    const contact = await this.findContact(event.payload.userId);
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

  private async findContact(userId: string): Promise<UserContact | null> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.lookup.attempts; attempt++) {
      try {
        const contact = await this.userDirectory.findById(userId);
        if (contact) return contact;
        lastError = undefined;
      } catch (err) {
        lastError = err;
      }
      if (attempt < this.lookup.attempts) await sleep(this.lookup.delayMs);
    }

    if (lastError) throw lastError;
    return null;
  }
}
