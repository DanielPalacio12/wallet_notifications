// Puerto de salida: registro de eventos ya procesados (idempotencia por eventId).
export interface ProcessedEventRepositoryPort {
  // Registra el evento de forma atómica.
  // Devuelve true si es nuevo y false si ya se había procesado (duplicado).
  markAsProcessed(eventId: string, topic: string): Promise<boolean>;
}

export const PROCESSED_EVENT_REPOSITORY = Symbol(
  'ProcessedEventRepositoryPort',
);
