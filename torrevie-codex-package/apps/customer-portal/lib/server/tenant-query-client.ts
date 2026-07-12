import { Pool, type PoolClient, type QueryResult as PgQueryResult, type QueryResultRow } from "pg";
import type { QueryResult, QueryValue, TenantQueryClient } from "@torrevie/tenant-context";

let pool: Pool | null = null;

export class PostgresTenantQueryClient implements TenantQueryClient {
  private transactionClient: PoolClient | null = null;

  constructor(private readonly userId: string) {}

  async query<Row>(sql: string, values: readonly QueryValue[] = []): Promise<QueryResult<Row>> {
    const command = sql.trim().toLowerCase();

    if (command === "begin") {
      await this.begin();
      return { rows: [] };
    }

    if (command === "commit") {
      await this.end("commit");
      return { rows: [] };
    }

    if (command === "rollback") {
      await this.end("rollback");
      return { rows: [] };
    }

    const result = this.transactionClient
      ? await this.transactionClient.query<QueryResultRow>(sql, [...values])
      : await getPool().query<QueryResultRow>(sql, [...values]);

    return toTenantResult<Row>(result);
  }

  private async begin() {
    if (this.transactionClient) {
      throw new Error("A tenant query transaction is already active.");
    }

    this.transactionClient = await getPool().connect();
    await this.transactionClient.query("begin");
    await this.transactionClient.query("set local role authenticated");
    await this.transactionClient.query("select set_config('request.jwt.claim.sub', $1, true)", [this.userId]);
  }

  private async end(command: "commit" | "rollback") {
    const client = this.transactionClient;

    if (!client) {
      throw new Error(`Cannot ${command} without an active tenant query transaction.`);
    }

    try {
      await client.query(command);
    } finally {
      client.release();
      this.transactionClient = null;
    }
  }
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: requireDatabaseUrl(),
      max: Number(process.env.TORREVIE_DATABASE_POOL_SIZE ?? 5),
      ssl: databaseSslConfig()
    });
  }

  return pool;
}

function databaseSslConfig() {
  if (process.env.TORREVIE_DATABASE_SSL !== "true") {
    return undefined;
  }

  return {
    rejectUnauthorized: process.env.TORREVIE_DATABASE_SSL_REJECT_UNAUTHORIZED === "true"
  };
}

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.SUPABASE_DB_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL, POSTGRES_URL, or SUPABASE_DB_URL must be configured for server-side tenant queries.");
  }

  return databaseUrl;
}

function toTenantResult<Row>(result: PgQueryResult<QueryResultRow>): QueryResult<Row> {
  return { rows: result.rows as Row[] };
}
