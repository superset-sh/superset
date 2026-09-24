import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query(
	`select nspname from pg_namespace where nspname not like 'pg_%' and nspname <> 'information_schema'`,
);
for (const { nspname } of rows as Array<{ nspname: string }>) {
	await pool.query(`drop schema if exists "${nspname}" cascade`);
	console.log("dropped", nspname);
}
await pool.query(`create schema public`);
await pool.end();
console.log("RESET DONE");
