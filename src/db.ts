import { Pool } from "@db/postgres";

/**
 * Shared Postgres connection pool, created from DATABASE_URL.
 *
 * Null when DATABASE_URL is not configured (e.g. local development without a
 * database), so callers can fall back to other behaviour rather than crash.
 */
export const pool: Pool | null = process.env.DATABASE_URL
  ? new Pool(process.env.DATABASE_URL, 5)
  : null;
