import { Pool, QueryResult } from 'pg';
import { decrypt } from './crypto';

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
 * - If company has connection_string → decrypt and connect to their external database
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

  const stored = res.rows[0]?.connection_string;

  // NULL = hosted by CRAS → use central pool
  if (!stored) {
    companyPools.set(companyId, centralPool);
    return centralPool;
  }

  // Decrypt the connection string
  const connStr = decrypt(stored);

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

/**
 * Save (encrypt) a company's connection string.
 * Called by admins when onboarding a self-hosted client.
 */
export async function saveConnectionString(companyId: string, connectionString: string): Promise<{ error: SerializableError }> {
  try {
    const { encrypt } = await import('./crypto');
    const encrypted = encrypt(connectionString);
    await centralPool.query(
      'UPDATE companies SET connection_string = $1 WHERE id = $2',
      [encrypted, companyId]
    );
    // Clear cached pool so next query uses the new connection
    companyPools.delete(companyId);
    return { error: null };
  } catch (err) {
    const error: SerializableError =
      err instanceof Error
        ? { message: err.message, stack: err.stack ?? null }
        : { message: String(err), stack: null };
    return { error };
  }
}

/**
 * Test a raw connection string without saving.
 * Used to verify credentials before encrypting/storing.
 */
export async function testRawConnectionString(connectionString: string): Promise<{ ok: boolean; error: SerializableError }> {
  let pool: Pool | null = null;
  try {
    pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
    await pool.query("SELECT 1 AS ok");
    return { ok: true, error: null };
  } catch (err) {
    const error: SerializableError =
      err instanceof Error
        ? { message: err.message, stack: err.stack ?? null }
        : { message: String(err), stack: null };
    return { ok: false, error };
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
}

/**
 * Reveal a company's connection string (decrypted).
 * Only callable by the company's own admin.
 */
export async function revealConnectionString(companyId: string): Promise<{ data: string | null; error: SerializableError }> {
  try {
    const res = await centralPool.query(
      'SELECT connection_string FROM companies WHERE id = $1',
      [companyId]
    );
    const stored = res.rows[0]?.connection_string;
    if (!stored) return { data: null, error: null };
    const decrypted = decrypt(stored);
    return { data: decrypted, error: null };
  } catch (err) {
    const error: SerializableError =
      err instanceof Error
        ? { message: err.message, stack: err.stack ?? null }
        : { message: String(err), stack: null };
    return { data: null, error };
  }
}

export { centralPool as pool };
