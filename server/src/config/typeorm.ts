import { registerAs } from '@nestjs/config';
import { config as dotenvConfig } from 'dotenv';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';

dotenvConfig({ path: '.env' });

const typeormOptions = {
  type: 'postgres' as const,
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  synchronize: false,
  autoLoadEntities: true,
  logging: (process.env.NODE_ENV ?? 'development') === 'development',
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
};

export default registerAs('typeorm', () => typeormOptions);

export const connectionSource = new DataSource(
  typeormOptions as DataSourceOptions,
);
