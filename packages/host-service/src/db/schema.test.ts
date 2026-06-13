import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const legacyMigrationPath = fileURLToPath(
	new URL(
		"../../drizzle/0006_add_terminal_session_locations.sql",
		import.meta.url,
	),
);
const migrationPath = fileURLToPath(
	new URL(
		"../../drizzle/0007_merge_terminal_session_locations_into_terminal_sessions.sql",
		import.meta.url,
	),
);
const snapshotPath = fileURLToPath(
	new URL("../../drizzle/meta/0007_snapshot.json", import.meta.url),
);

describe("terminal session restore schema artifacts", () => {
	test("merges legacy location rows into terminal_sessions", () => {
		const legacyMigrationSql = readFileSync(legacyMigrationPath, "utf8");
		expect(legacyMigrationSql).toContain(
			"CREATE TABLE `terminal_session_locations`",
		);

		const migrationSql = readFileSync(migrationPath, "utf8");
		expect(migrationSql).toContain(
			"ALTER TABLE `terminal_sessions` ADD COLUMN `tab_id` text;",
		);
		expect(migrationSql).toContain(
			"ALTER TABLE `terminal_sessions` ADD COLUMN `location_key` text;",
		);
		expect(migrationSql).toContain("INSERT INTO `terminal_sessions`");
		expect(migrationSql).toContain(
			"DROP TABLE IF EXISTS `terminal_session_locations`;",
		);

		const snapshotJson = readFileSync(snapshotPath, "utf8");
		expect(snapshotJson).not.toContain('"terminal_session_locations"');
		expect(snapshotJson).toContain('"tab_id"');
		expect(snapshotJson).toContain('"location_key"');
	});
});
