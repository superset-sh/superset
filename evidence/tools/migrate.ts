/**
 * Applies packages/db migrations to the throwaway Neon project the drive uses.
 * `drizzle-kit migrate` cannot: this sandbox has no outbound TCP:5432, so it
 * goes over Neon's WebSocket proxy instead (see ../NOTES.md).
 */
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import ws from "ws";

neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL missing");
const pool = new Pool({ connectionString: url });
const db = drizzle({ client: pool });
await migrate(db, { migrationsFolder: "/workspace/packages/db/drizzle" });
console.log("MIGRATIONS APPLIED");
await pool.end();
