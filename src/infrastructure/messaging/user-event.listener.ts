import { HandleUserEventUseCase } from '../../application/handle-user-event.use-case';
import {
  invalidFields,
  ListenerLogger,
  logDelivery,
  safeError,
} from './delivery-logging';
import { UserEventSchema } from './user-event.schema';

export type { ListenerLogger } from './delivery-logging';

// Valida el evento de Users, lo pasa al caso de uso y registra el resultado.
// Logs sin PII: solo eventId, aggregateId, topic y estado del envío.
// No depende de Nest para poder probarlo de forma aislada.
export class UserEventListener {
  constructor(
    private readonly handleUserEvent: HandleUserEventUseCase,
    private readonly logger: ListenerLogger,
  ) {}

  // Nunca lanza: un evento que falla no debe bloquear el consumo del tópico.
  async handle(payload: unknown, topic: string): Promise<void> {
    const parsed = UserEventSchema.safeParse(payload);
    if (!parsed.success) {
      this.logger.warn(
        `Evento inválido descartado topic=${topic} campos=[${invalidFields(parsed.error.issues)}]`,
      );
      return;
    }

    const { eventId, aggregateId } = parsed.data;
    const ref = `eventId=${eventId} aggregateId=${aggregateId} topic=${topic}`;

    try {
      const result = await this.handleUserEvent.execute(parsed.data, topic);

      if (result.directoryError) {
        this.logger.warn(
          `No se pudo actualizar el directorio de contactos ${ref}: ${safeError(result.directoryError)}`,
        );
      }

      if (result.status === 'skipped') {
        this.logger.log(`Evento sin email, no se envía correo ${ref}`);
      } else if (result.status === 'duplicate') {
        this.logger.log(`Evento duplicado ignorado ${ref}`);
      } else {
        logDelivery(this.logger, ref, result.delivery, result.idempotencyError);
      }
    } catch (err) {
      this.logger.error(
        `Error inesperado procesando ${ref}: ${safeError(err)}`,
      );
    }
  }
}
