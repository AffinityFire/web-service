import { Pool, type PoolClient, type QueryObjectResult } from "@db/postgres";
import type { Context } from "@oak/oak";

/**
 * Shared Postgres connection pool, created from DATABASE_URL.
 *
 * Null when DATABASE_URL is not configured (e.g. local development without a
 * database), so callers can fall back to other behaviour rather than crash.
 */
export const pool: Pool | null = process.env.DATABASE_URL
  ? new Pool(process.env.DATABASE_URL, 5)
  : null;

function max_conns() {
  const PG_CONN_MAX = Deno.env.get("PG_CONN_MAX");
  const POOL_CONNECTIONS = PG_CONN_MAX ? parseInt(PG_CONN_MAX) : 20;
  return POOL_CONNECTIONS;
}

export interface Conns {
  max_conn: number;
  used: bigint;
  res_for_super: number;
  res_for_normal: bigint;
}

export class AppDbConn {
  public db: { client: PoolClient };
  constructor(db: { client: PoolClient }) {
    this.db = db;
  }
  async release() {
    await this.db.client.release();
  }
  async [Symbol.asyncDispose]() {
    await this.release();
  }
  public async runScript(script: string) {
    const tx = this.db.client.createTransaction("transaction_1");
    await tx.begin();
    await tx.queryObject(script);
    await tx.commit();
  }

  public async appConns(): Promise<
    { application_name: string; n_conns: number }[]
  > {
    const q =
      `SELECT application_name,count(*) as n_conns FROM pg_stat_activity group by application_name;`;
    const result: QueryObjectResult<{
      application_name: string;
      n_conns: number;
    }> = await this.db.client.queryObject(q);
    return result.rows;
  }
  public async conns(): Promise<Conns> {
    const q =
      `select max_conn,used,res_for_super,max_conn-used-res_for_super res_for_normal
  from
    (select count(*) used from pg_stat_activity) t1,
    (select setting::int res_for_super from pg_settings where name=$$superuser_reserved_connections$$) t2,
    (select setting::int max_conn from pg_settings where name=$$max_connections$$) t3`;
    const result: QueryObjectResult<Conns> = await this.db.client.queryObject(
      q,
    );
    return result.rows[0];
  }
}

export class AppDb {
  private pool: Pool;
  constructor(
    databaseUrl: string,
    applicationName?: string,
    opts?: { maxConn?: number },
  ) {
    const size: number = opts?.maxConn ?? max_conns();
    this.pool = new Pool(
      databaseUrl,
      size,
    );
    console.log(
      `pool established with ${size} connections for ${applicationName}`,
    );
  }
  async connect(): Promise<AppDbConn> {
    const conn = await this.pool.connect();
    return new AppDbConn({ client: conn });
  }
  async close() {
    await this.pool.end();
  }
  async [Symbol.asyncDispose]() {
    await this.close();
  }
}

export async function setupDbPool(
  databaseUrl: string,
  applicationName?: string,
  opts?: { maxConn?: number },
): Promise<AppDb> {
  const db = new AppDb(databaseUrl, applicationName, opts);
  return db;
}

let twayDbConning: Promise<AppDb> | undefined;
let twayDb: AppDb | undefined;

async function getAppDb(databaseUrl: string, applicationName: string) {
  if (!twayDb) {
    if (!twayDbConning) {
      twayDbConning = setupDbPool(databaseUrl, applicationName);
    }
    twayDb = await twayDbConning;
  }
  return twayDb;
}

async function appDbConnect(databaseUrl: string, applicationName: string) {
  return await (await getAppDb(databaseUrl, applicationName)).connect();
}

export function dbMiddleware(databaseUrl: string, appName: string) {
  return async (
    ctx: Context<{ db?: AppDbConn }>,
    next: () => Promise<unknown>,
  ) => {
    // all routes not in /public get a db connection, TODO make this narrower still
    if (ctx.request.url.pathname.startsWith("/public/")) return await next();
    try {
      ctx.state.db = await appDbConnect(databaseUrl, appName);
      return await next();
    } finally {
      if (ctx.state.db) ctx.state.db.release();
    }
  };
}
