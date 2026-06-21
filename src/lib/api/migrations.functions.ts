import { createServerFn } from "@tanstack/react-start";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

/**
 * Server function: Reads local Supabase migration files and executes
 * them directly against the database to initialize types, tables, and triggers.
 */
export const runMigrations = createServerFn({ method: "POST" })
  .handler(async () => {
    const { pool } = await import("@/lib/db.server");

    const migrationFiles = [
      "20260616073537_5b8502e1-4e34-4335-8fa9-06e35fe735b6.sql",
      "20260616073551_85c95dfa-e89a-48dd-8429-c38df9d779d2.sql"
    ];

    const results: string[] = [];

    for (const file of migrationFiles) {
      const filePath = path.join(process.cwd(), "supabase", "migrations", file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Migration file not found at: ${filePath}`);
      }

      const sql = fs.readFileSync(filePath, "utf-8");
      
      try {
        await pool.query(sql);
        results.push(`Successfully applied: ${file}`);
      } catch (err: any) {
        console.error(`Error running migration ${file}:`, err);
        throw new Error(`Failed on ${file}: ${err.message}`);
      }
    }

    return { success: true, log: results };
  });
