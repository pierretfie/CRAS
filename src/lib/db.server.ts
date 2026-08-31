import { Pool, QueryResult } from 'pg';

// ── Central pool (registry + hosted company data) ──────────
const centralPool = new Pool({
  connectionString: process.env.CENTRAL_DATABASE_URL || process.env.DATABASE_URL,
});

// ── Per-company pool cache ─────────────────────────────────
const companyPools = new Map<string, Pool>();

type SerializableError = { message: string; stack: string | null } | null;

/**
 * Get the connection pool for a company.
 * - If companyId is null/undefined → use central pool (legacy/default)
 * - If company has connection_string null → use central pool (hosted by CRAS)
 * - If company has connection_string → connect to their external database
 */
async function getPool(companyId?: string | null): Promise<Pool> {
  // No companyId = use central pool (backward compatible)
  if (!companyId) return centralPool;

  // Check cache
  if (companyPools.has(companyId)) return companyPools.get(companyId)!;

  // Look up connection string from registry
  const res = await centralPool.query(
    'SELECT connection_string FROM companies WHERE id = $1',
    [companyId]
  );

  const connStr = res.rows[0]?.connection_string;

  // NULL = hosted by CRAS → use central pool
  if (!connStr) {
    companyPools.set(companyId, centralPool);
    return centralPool;
  }

  // External database → create new pool
  const pool = new Pool({ connectionString: connStr });
  companyPools.set(companyId, pool);
  return pool;
}

/**
 * Execute a query on the server side.
 * If companyId is provided, routes to the correct database.
 */
export async function queryServer(
  text: string,
  params?: any[],
  companyId?: string | null,
): Promise<{ data: any[] | null; error: SerializableError }> {
  try {
    const pool = await getPool(companyId);
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

export { centralPool as pool };
