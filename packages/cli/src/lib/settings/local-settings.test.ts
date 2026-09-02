import { describe, expect, test } from "bun:test";
import {
	readSettingsRow,
	updateSettingsAtomically,
	writeSetting,
} from "./local-settings";
import { createLocalSettingsDb, withTempSupersetHome } from "./test-helpers";

const home = withTempSupersetHome("superset-cli-settings-");
const createLocalDb = () => createLocalSettingsDb(home.dir);

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

	test("atomic updates derive a patch and result from the locked row", () => {
		createLocalDb();
		writeSetting("notificationVolume", 40);

		const result = updateSettingsAtomically((row) => ({
			patch: { notificationVolume: (row?.notificationVolume ?? 0) + 2 },
			result: row?.notificationVolume,
		}));

		expect(result).toBe(40);
		expect(readSettingsRow()?.notificationVolume).toBe(42);
	});

	test("atomic updates target a legacy row with a non-1 id", () => {
		createLocalSettingsDb(home.dir, 7);
		updateSettingsAtomically(() => ({
			patch: { notificationVolume: 55 },
			result: undefined,
		}));
		const row = readSettingsRow();
		expect(row?.id).toBe(7);
		expect(row?.notificationVolume).toBe(55);
		expect(row?.confirmOnQuit).toBe(true);
	});
});
