import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { DATABASE_POOL } from './database.tokens';

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: any[],
  ): Promise<QueryResult<T>> {
    try {
      return await this.pool.query<T>(text, params);
    } catch (err) {
      this.logger.error(`Query error: ${text}`, err as Error);
      throw err;
    }
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }
}
