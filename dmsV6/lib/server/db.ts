import { Pool, type PoolClient, type QueryResultRow } from 'pg';

const buildConnectionString = () => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.PGHOST || '127.0.0.1';
  const port = process.env.PGPORT || '5432';
  const database = process.env.PGDATABASE || 'dms';
  const user = process.env.PGUSER || 'postgres';
  const password = process.env.PGPASSWORD || '';
  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);

  return `postgres://${encodedUser}:${encodedPassword}@${host}:${port}/${database}`;
};

const globalForDb = globalThis as typeof globalThis & {
  dmsPgPool?: Pool;
};

export const pool =
  globalForDb.dmsPgPool ||
  new Pool({
    connectionString: buildConnectionString(),
    max: Number(process.env.PGPOOL_MAX || 10),
    idleTimeoutMillis: 30_000
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.dmsPgPool = pool;
}

export const query = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
) => pool.query<T>(text, params);

export const withTransaction = async <T>(work: (client: PoolClient) => Promise<T>) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
