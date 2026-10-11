import { Notification } from '../notification';

// Puerto de salida: persistencia del historial de notificaciones.
export interface NotificationRepositoryPort {
  // Guarda una notificación nueva y devuelve su id.
  create(notification: Notification): Promise<number>;
  updateStatus(notification: Notification): Promise<void>;
}

export const NOTIFICATION_REPOSITORY = Symbol('NotificationRepositoryPort');
