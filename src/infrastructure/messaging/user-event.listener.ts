import { HandleUserEventUseCase } from '../../application/handle-user-event.use-case';
import { UserEventSchema } from './user-event.schema';

// Lo mínimo que se necesita para loguear (el Logger de Nest lo cumple).
export interface ListenerLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

// Los mensajes de error de SMTP/API pueden traer el destinatario: se ocultan los emails.
const safeError = (err: unknown) =>
  String((err as Error)?.message ?? err).replace(/[^\s@<>"']+@[^\s@<>"']+/g, '[email]');

// Valida el evento, lo pasa al caso de uso y registra el resultado.
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
      const fields = parsed.error.issues.map((i) => i.path.join('.') || '(raíz)').join(', ');
      this.logger.warn(`Evento inválido descartado topic=${topic} campos=[${fields}]`);
      return;
    }

    const { eventId, aggregateId } = parsed.data;
    const ref = `eventId=${eventId} aggregateId=${aggregateId} topic=${topic}`;

    try {
      const result = await this.handleUserEvent.execute(parsed.data, topic);

      if (result.status === 'skipped') {
        this.logger.log(`Evento sin email, no se envía correo ${ref}`);
        return;
      }
      if (result.status === 'duplicate') {
        this.logger.log(`Evento duplicado ignorado ${ref}`);
        return;
      }

      const { idempotencyError, delivery } = result;
      if (idempotencyError) {
        this.logger.warn(`No se pudo registrar el eventId ${ref}: ${safeError(idempotencyError)}`);
      }
      if (delivery.persistenceError) {
        this.logger.warn(
          `No se pudo guardar la notificación ${ref}: ${safeError(delivery.persistenceError)}`,
        );
      }
      if (delivery.deliveryError) {
        // TODO: reintentos / dead letter topic
        this.logger.error(`Envío FALLIDO ${ref}: ${safeError(delivery.deliveryError)}`);
      } else {
        this.logger.log(`Correo ENVIADO ${ref}`);
      }
    } catch (err) {
      this.logger.error(`Error inesperado procesando ${ref}: ${safeError(err)}`);
    }
  }
}
