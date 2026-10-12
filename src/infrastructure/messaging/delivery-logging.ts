import { SendEmailNotificationResult } from '../../application/send-email-notification.use-case';

// Lo mínimo que se necesita para loguear (el Logger de Nest lo cumple).
export interface ListenerLogger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

// Los mensajes de error de SMTP/API pueden traer el destinatario: se ocultan los emails.
export const safeError = (err: unknown) =>
  String((err as Error)?.message ?? err).replace(
    /[^\s@<>"']+@[^\s@<>"']+/g,
    '[email]',
  );

// Nombres de los campos inválidos, nunca sus valores (pueden ser PII).
export const invalidFields = (issues: Array<{ path: PropertyKey[] }>) =>
  issues.map((i) => i.path.map(String).join('.') || '(raíz)').join(', ');

// Registra el resultado de un envío. Logs sin PII: solo la referencia del evento.
export function logDelivery(
  logger: ListenerLogger,
  ref: string,
  delivery: SendEmailNotificationResult,
  idempotencyError?: unknown,
) {
  if (idempotencyError) {
    logger.warn(
      `No se pudo registrar el eventId ${ref}: ${safeError(idempotencyError)}`,
    );
  }
  if (delivery.persistenceError) {
    logger.warn(
      `No se pudo guardar la notificación ${ref}: ${safeError(delivery.persistenceError)}`,
    );
  }
  if (delivery.deliveryError) {
    // TODO: reintentos / dead letter topic
    logger.error(`Envío FALLIDO ${ref}: ${safeError(delivery.deliveryError)}`);
  } else {
    logger.log(`Correo ENVIADO ${ref}`);
  }
}
