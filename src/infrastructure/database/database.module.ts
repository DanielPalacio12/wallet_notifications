import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from './database.tokens';
import { DatabaseService } from './database.service';

const poolProvider = {
  provide: DATABASE_POOL,
  useFactory: (): Pool => {
    return new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      ssl:
        process.env.DB_SSL_MODE === 'require'
          ? { rejectUnauthorized: false }
          : undefined,
    });
  },
};

@Global()
@Module({
  providers: [poolProvider, DatabaseService],
  exports: [poolProvider, DatabaseService],
})
export class DatabaseModule {}
