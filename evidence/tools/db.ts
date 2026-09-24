/**
 * Read-only-ish access to the throwaway Neon project the drive runs against.
 * The sandbox cannot reach Postgres over TCP:5432, so this goes over Neon's
 * WebSocket proxy (see evidence/NOTES.md).
 */
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function q<T = Record<string, unknown>>(
	text: string,
	params: unknown[] = [],
): Promise<T[]> {
	const { rows } = await pool.query(text, params);
	return rows as T[];
}
