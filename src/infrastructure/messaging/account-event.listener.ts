import { HandleAccountEventUseCase } from '../../application/handle-account-event.use-case';
import { AccountEventSchema } from './account-event.schema';
import {
  invalidFields,
  ListenerLogger,
  logDelivery,
  safeError,
} from './delivery-logging';

// Valida el evento de Accounts, lo pasa al caso de uso y registra el resultado.
// Logs sin PII: solo eventId, aggregateId (id de la cuenta), topic y estado.
export class AccountEventListener {
  constructor(
    private readonly handleAccountEvent: HandleAccountEventUseCase,
    private readonly logger: ListenerLogger,
  ) {}

  // Los eventos inválidos y los fallos de envío se registran y se sigue.
  // Solo relanza si no se pudo consultar el directorio (p. ej. la BD al despertar):
  // así Kafka no confirma el mensaje y lo vuelve a entregar en vez de perderlo.
  async handle(payload: unknown, topic: string): Promise<void> {
    const parsed = AccountEventSchema.safeParse(payload);
    if (!parsed.success) {
      this.logger.warn(
        `Evento inválido descartado topic=${topic} campos=[${invalidFields(parsed.error.issues)}]`,
      );
      return;
    }

    const { eventId, aggregateId } = parsed.data;
    const ref = `eventId=${eventId} aggregateId=${aggregateId} topic=${topic}`;

    try {
      const result = await this.handleAccountEvent.execute(parsed.data, topic);

      if (result.status === 'unknown-user') {
        this.logger.warn(
          `Usuario sin contacto en el directorio, no se envía correo ${ref}`,
        );
      } else if (result.status === 'duplicate') {
        this.logger.log(`Evento duplicado ignorado ${ref}`);
      } else {
        logDelivery(this.logger, ref, result.delivery, result.idempotencyError);
      }
    } catch (err) {
      this.logger.error(
        `No se pudo procesar, Kafka lo reintentará ${ref}: ${safeError(err)}`,
      );
      throw err;
    }
  }
}
