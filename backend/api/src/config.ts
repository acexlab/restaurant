import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtTtlSeconds: Number(process.env.JWT_TTL_SECONDS ?? 3600),
  outboxPollMs: Number(process.env.OUTBOX_POLL_MS ?? 1000),
  /** Base delay for exponential retry backoff: delay = base * 2^(attempt-1). */
  retryBaseMs: Number(process.env.EVENT_RETRY_BASE_MS ?? 2000),
  maxDeliveryAttempts: Number(process.env.EVENT_MAX_ATTEMPTS ?? 5),
  supportGrantMaxHours: 4,
};
