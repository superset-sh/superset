/**
 * Bundled migrations for PGlite (browser-compatible)
 *
 * Each migration is imported as raw SQL at build time using Vite's ?raw suffix.
 * This allows drizzle-kit generated migrations to work in the browser without
 * filesystem access.
 *
 * To add a new migration:
 * 1. Generate with drizzle-kit: `bunx drizzle-kit generate --name="description"`
 * 2. Import the SQL file here with ?raw suffix
 * 3. Add to the migrations array with the correct timestamp from meta/_journal.json
 */

import sql0000 from "./0000_init.sql?raw";

export interface Migration {
	tag: string;
	sql: string;
	when: number;
}

export const migrations: Migration[] = [
	{ tag: "0000_init", sql: sql0000, when: 1766810258689 },
];
