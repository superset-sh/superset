import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { settings } from "@superset/local-db/schema";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { readSettingsRow, writeSetting } from "./local-settings";

let homeDir: string;
let previousHome: string | undefined;

/** Create local.db with the real settings columns, like the desktop app would. */
function createLocalDb() {
	const { columns } = getTableConfig(settings);
	const ddl = columns
		.map(
			(column) =>
				`"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}`,
		)
		.join(", ");
	const sqlite = new Database(join(homeDir, "local.db"));
	sqlite.exec(`CREATE TABLE settings (${ddl})`);
	sqlite.close();
}

beforeEach(() => {
	previousHome = process.env.SUPERSET_HOME_DIR;
	homeDir = mkdtempSync(join(tmpdir(), "superset-cli-settings-"));
	process.env.SUPERSET_HOME_DIR = homeDir;
});

afterEach(() => {
	if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = previousHome;
	rmSync(homeDir, { recursive: true, force: true });
});

describe("local settings store", () => {
	test("read returns undefined when the database does not exist", () => {
		expect(readSettingsRow()).toBeUndefined();
	});

	test("write refuses to create the database", () => {
		expect(() => writeSetting("confirmOnQuit", false)).toThrow(/not found/);
	});

	test("write upserts the settings row and read round-trips values", () => {
		createLocalDb();
		expect(readSettingsRow()).toBeUndefined();

		writeSetting("confirmOnQuit", false);
		writeSetting("terminalFontSize", 16);
		writeSetting("selectedRingtoneId", "ping");

		const row = readSettingsRow();
		expect(row?.confirmOnQuit).toBe(false);
		expect(row?.terminalFontSize).toBe(16);
		expect(row?.selectedRingtoneId).toBe("ping");
	});

	test("writing one key does not clobber others", () => {
		createLocalDb();
		writeSetting("confirmOnQuit", false);
		writeSetting("notificationVolume", 40);
		const row = readSettingsRow();
		expect(row?.confirmOnQuit).toBe(false);
		expect(row?.notificationVolume).toBe(40);
	});

	test("writing null resets a setting to the app default", () => {
		createLocalDb();
		writeSetting("terminalFontSize", 18);
		writeSetting("terminalFontSize", null);
		expect(readSettingsRow()?.terminalFontSize).toBeNull();
	});
});
