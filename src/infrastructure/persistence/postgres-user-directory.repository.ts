import { Injectable } from '@nestjs/common';
import {
  UserContact,
  UserDirectoryPort,
} from '../../domain/ports/user-directory.port';
import { DatabaseService } from '../database/database.service';

// Adaptador de salida: directorio de contactos en la tabla user_contacts.
@Injectable()
export class PostgresUserDirectoryRepository implements UserDirectoryPort {
  constructor(private readonly db: DatabaseService) {}

  async save({ userId, name, email }: UserContact): Promise<void> {
    await this.db.query(
      `INSERT INTO user_contacts (user_id, name, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET name = COALESCE(EXCLUDED.name, user_contacts.name),
             email = EXCLUDED.email,
             updated_at = now()`,
      [userId, name ?? null, email],
    );
  }

  async findById(userId: string): Promise<UserContact | null> {
    const result = await this.db.query<{
      user_id: string;
      name: string | null;
      email: string;
    }>('SELECT user_id, name, email FROM user_contacts WHERE user_id = $1', [
      userId,
    ]);
    const row = result.rows[0];
    return row
      ? { userId: row.user_id, name: row.name ?? undefined, email: row.email }
      : null;
  }
}
