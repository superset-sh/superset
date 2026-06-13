import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migrationPath = fileURLToPath(
	new URL(
		"../../drizzle/0006_add_terminal_session_locations.sql",
		import.meta.url,
	),
);
const snapshotPath = fileURLToPath(
	new URL("../../drizzle/meta/0006_snapshot.json", import.meta.url),
);

describe("terminalSessionLocations schema artifacts", () => {
	test("does not require terminal_sessions parent rows", () => {
		const migrationSql = readFileSync(migrationPath, "utf8");
		expect(migrationSql).not.toContain(
			"FOREIGN KEY (`pane_id`) REFERENCES `terminal_sessions`(`id`)",
		);
		expect(migrationSql).toContain(
			"FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`)",
		);

		const snapshotJson = readFileSync(snapshotPath, "utf8");
		expect(snapshotJson).not.toContain(
			"terminal_session_locations_pane_id_terminal_sessions_id_fk",
		);
		expect(snapshotJson).toContain(
			"terminal_session_locations_workspace_id_workspaces_id_fk",
		);
	});
});
