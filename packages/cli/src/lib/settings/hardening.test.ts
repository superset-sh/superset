import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readThemeState } from "./app-state";
import { readHostGitSettings, writeHostGitSetting } from "./host-settings";
import { readSettingsRow } from "./local-settings";
import { createLocalSettingsDb, withTempSupersetHome } from "./test-helpers";

const home = withTempSupersetHome("superset-cli-hardening-");
const createLocalDb = (rowId?: number) =>
	createLocalSettingsDb(home.dir, rowId);

describe("state-dependent failure hardening", () => {
	test("reads a legacy settings row with a non-1 id (desktop parity)", () => {
		createLocalDb(7);
		expect(readSettingsRow()?.confirmOnQuit).toBe(true);
	});

	test("reads a WAL-mode database whose sidecars were checkpointed away", () => {
		createLocalDb(1);
		const sqlite = new Database(join(home.dir, "local.db"));
		sqlite.exec("PRAGMA journal_mode = WAL");
		sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE)");
		sqlite.close();
		expect(readSettingsRow()?.confirmOnQuit).toBe(true);
	});

	test("corrupt app-state.json yields an actionable error, not a SyntaxError", () => {
		writeFileSync(join(home.dir, "app-state.json"), "{ not json");
		expect(() => readThemeState()).toThrow(/not valid JSON/);
	});

	test("host settings fail fast with a hint when the service port is dead", async () => {
		// live pid (this process) + dead endpoint = stale-manifest scenario
		const orgDir = join(home.dir, "host", "org-1");
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
