// Eventos de dominio que publica el microservicio Users (otro equipo).
export type UserEventType = 'USER_CREATED' | 'USER_UPDATED' | 'USER_DELETED';

// USER_DELETED puede llegar solo con el id (Users ya borró los datos).
export interface UserSnapshot {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  status?: string;
}

export interface UserEvent {
  eventId: string;
  eventType: UserEventType;
  occurredAt: string;
  aggregateId: string;
  payload: UserSnapshot;
}
