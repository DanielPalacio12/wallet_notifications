import { Injectable } from '@nestjs/common';
import { Notification } from '../../domain/notification';
import { NotificationRepositoryPort } from '../../domain/ports/notification-repository.port';
import { DatabaseService } from '../database/database.service';

// Adaptador de salida: implementa NotificationRepositoryPort sobre Postgres.
@Injectable()
export class PostgresNotificationRepository implements NotificationRepositoryPort {
  constructor(private readonly db: DatabaseService) {}

  async create(notification: Notification): Promise<number> {
    const query = `
      INSERT INTO notifications (to_email, subject, body, status, sent_at, error_message, topic)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;
    const values = [
      notification.toEmail,
      notification.subject,
      notification.body,
      notification.status,
      notification.sentAt,
      notification.errorMessage,
      notification.topic,
    ];
    const result = await this.db.query<{ id: number }>(query, values);
    return result.rows[0].id;
  }

  async updateStatus(notification: Notification): Promise<void> {
    const query = `
      UPDATE notifications
      SET status = $1, sent_at = $2, error_message = $3
      WHERE id = $4
    `;
    await this.db.query(query, [
      notification.status,
      notification.sentAt,
      notification.errorMessage,
      notification.id,
    ]);
  }
}
