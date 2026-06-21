const fs = require("fs");
const { Pool } = require("pg");

// Manually parse .env
const envFile = fs.readFileSync(".env", "utf8");
let dbUrl = "";
for (const line of envFile.split("\n")) {
  if (line.startsWith("DATABASE_URL=")) {
    dbUrl = line.split("=")[1].replace(/['"]/g, "").trim();
  }
}

console.log("Using Database URL:", dbUrl ? dbUrl.substring(0, 30) + "..." : "undefined");

const pool = new Pool({
  connectionString: dbUrl,
});

async function main() {
  try {
    const res = await pool.query("SELECT COUNT(*) FROM clients");
    console.log("Client count:", res.rows[0].count);
    
    const res2 = await pool.query("SELECT COUNT(*) FROM profiles");
    console.log("Profile count:", res2.rows[0].count);
    
    const res3 = await pool.query("SELECT COUNT(*) FROM client_stage_events");
    console.log("Events count:", res3.rows[0].count);
  } catch (error) {
    console.error("DB Query Error:", error);
  } finally {
    await pool.end();
  }
}

main();
