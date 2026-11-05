// Applies drizzle/*.sql migrations using runtime dependencies only (no drizzle-kit),
// so it can run as Railway's pre-deploy command.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = postgres(url, { max: 1, prepare: false });
try {
  await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
  console.log("migrations applied");
} finally {
  await sql.end();
}
