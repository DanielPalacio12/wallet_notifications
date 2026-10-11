import { Injectable } from '@nestjs/common';
import { ProcessedEventRepositoryPort } from '../../domain/ports/processed-event-repository.port';
import { DatabaseService } from '../database/database.service';

// Adaptador de salida: idempotencia con la tabla processed_events.
// El INSERT ... ON CONFLICT es atómico, así que dos consumidores no procesan el mismo evento.
@Injectable()
export class PostgresProcessedEventRepository implements ProcessedEventRepositoryPort {
  constructor(private readonly db: DatabaseService) {}

  async markAsProcessed(eventId: string, topic: string): Promise<boolean> {
    const result = await this.db.query(
      `INSERT INTO processed_events (event_id, topic)
       VALUES ($1, $2)
       ON CONFLICT (event_id) DO NOTHING`,
      [eventId, topic],
    );
    return result.rowCount === 1;
  }
}
