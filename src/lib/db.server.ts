import { Pool, QueryResult } from 'pg';

// Create a PostgreSQL connection pool - server only
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

type SerializableError = { message: string; stack: string | null } | null;

/**
 * Execute a query on the server side
 */
export async function queryServer(
  text: string,
  params?: any[],
): Promise<{ data: any[] | null; error: SerializableError }> {
  try {
    const res: QueryResult = await pool.query(text, params);
    return { data: res.rows, error: null };
  } catch (err) {
    const error: SerializableError =
      err instanceof Error
        ? { message: err.message, stack: err.stack ?? null }
        : { message: String(err), stack: null };
    return { data: null, error };
  }
}

export { pool };
