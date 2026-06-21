import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const client = await pool.connect();
try {
  // Check if product column exists
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'product'`
  );
  if (rows.length > 0) {
    console.log("✅ product column exists on clients");
  } else {
    console.log("❌ product column MISSING — applying migration...");

    // Run migration
    const migration = `
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS product TEXT;
      CREATE TABLE IF NOT EXISTS admin_products (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE INDEX IF NOT EXISTS clients_product_idx ON clients(product);
      GRANT SELECT ON admin_products TO authenticated, service_role;
      GRANT ALL ON admin_products TO service_role;
      CREATE POLICY "admins_insert_products" ON admin_products FOR INSERT TO authenticated USING (auth.has_role('admin'));
      CREATE POLICY "admins_update_products" ON admin_products FOR UPDATE TO authenticated USING (auth.has_role('admin'));
      CREATE POLICY "admins_delete_products" ON admin_products FOR DELETE TO authenticated USING (auth.has_role('admin'));
      ALTER TABLE admin_products ENABLE ROW LEVEL SECURITY;
    `;
    await client.query(migration);
    console.log("✅ Migration applied");

    // Verify
    const { rows: r2 } = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'product'`
    );
    console.log(r2.length > 0 ? "✅ Verified: product column present" : "❌ FAILED: product column still missing");
  }
} finally {
  client.release();
  await pool.end();
}