// Eventos de dominio que publica el microservicio Accounts (Paso-7).
// No traen email: el destinatario se busca por userId en el directorio local.
export type AccountEventType = 'ACCOUNT_CREATED';

export interface AccountSnapshot {
  accountId: string;
  // Número visible para el cliente; Accounts todavía no lo envía
  accountNumber?: string;
  userId: string;
  balance: number;
  currency: string;
  status?: string;
}

export interface AccountEvent {
  eventId: string;
  eventType: AccountEventType;
  occurredAt: string;
  aggregateId: string;
  payload: AccountSnapshot;
}
