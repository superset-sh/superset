import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { settings } from "@superset/local-db/schema";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { readThemeState } from "./app-state";
import { readHostGitSettings, writeHostGitSetting } from "./host-settings";
import { readSettingsRow } from "./local-settings";

let homeDir: string;
let previousHome: string | undefined;

beforeEach(() => {
	previousHome = process.env.SUPERSET_HOME_DIR;
	homeDir = mkdtempSync(join(tmpdir(), "superset-cli-hardening-"));
	process.env.SUPERSET_HOME_DIR = homeDir;
});

afterEach(() => {
	if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = previousHome;
	rmSync(homeDir, { recursive: true, force: true });
});

function createLocalDb(rowId?: number) {
	const { columns } = getTableConfig(settings);
	const ddl = columns
		.map(
			(column) =>
				`"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}`,
		)
		.join(", ");
	const sqlite = new Database(join(homeDir, "local.db"));
	sqlite.exec(`CREATE TABLE settings (${ddl})`);
	if (rowId !== undefined) {
		sqlite.exec(
			`INSERT INTO settings (id, confirm_on_quit) VALUES (${rowId}, 1)`,
		);
	}
	sqlite.close();
}

describe("state-dependent failure hardening", () => {
	test("reads a legacy settings row with a non-1 id (desktop parity)", () => {
		createLocalDb(7);
		expect(readSettingsRow()?.confirmOnQuit).toBe(true);
	});

	test("reads a WAL-mode database whose sidecars were checkpointed away", () => {
		createLocalDb(1);
		const sqlite = new Database(join(homeDir, "local.db"));
		sqlite.exec("PRAGMA journal_mode = WAL");
		sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE)");
		sqlite.close();
		expect(readSettingsRow()?.confirmOnQuit).toBe(true);
	});

	test("corrupt app-state.json yields an actionable error, not a SyntaxError", () => {
		writeFileSync(join(homeDir, "app-state.json"), "{ not json");
		expect(() => readThemeState()).toThrow(/not valid JSON/);
	});

	test("host settings fail fast with a hint when the service port is dead", async () => {
		// live pid (this process) + dead endpoint = stale-manifest scenario
		const orgDir = join(homeDir, "host", "org-1");
		mkdirSync(orgDir, { recursive: true });
		writeFileSync(
			join(orgDir, "manifest.json"),
			JSON.stringify({
				pid: process.pid,
				endpoint: "http://127.0.0.1:9",
				authToken: "token",
				organizationId: "org-1",
			}),
		);
		const started = performance.now();
		await expect(readHostGitSettings()).rejects.toThrow(
			/Could not reach the host service/,
		);
		await expect(
			writeHostGitSetting("branchPrefixMode", "custom"),
		).rejects.toThrow(/Could not reach the host service/);
		// connection-refused should fail quickly, and never hang past the timeout
		expect(performance.now() - started).toBeLessThan(6000);
	});
});
