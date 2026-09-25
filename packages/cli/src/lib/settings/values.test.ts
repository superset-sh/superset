import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getSettingDefinition, SETTINGS } from "./registry";
import { readAllSettings, readSettingValue } from "./values";

let homeDir: string;
let previousHome: string | undefined;

beforeEach(() => {
	previousHome = process.env.SUPERSET_HOME_DIR;
	homeDir = mkdtempSync(join(tmpdir(), "superset-cli-values-"));
	process.env.SUPERSET_HOME_DIR = homeDir;
});

afterEach(() => {
	if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = previousHome;
	rmSync(homeDir, { recursive: true, force: true });
});

describe("setting value routing", () => {
	test("git settings are host-service backed", () => {
		for (const key of [
			"branchPrefixMode",
			"branchPrefixCustom",
			"worktreeBaseDir",
		]) {
			expect(getSettingDefinition(key).store).toBe("hostService");
		}
		expect(getSettingDefinition("confirmOnQuit").store).toBeUndefined();
	});

	test("reading a host setting without a running host service fails with a hint", async () => {
		await expect(
			readSettingValue(getSettingDefinition("branchPrefixMode")),
		).rejects.toThrow(/host service isn't running/i);
	});

	test("list degrades host settings to a note instead of failing", async () => {
		const readings = await readAllSettings(SETTINGS);
		expect(readings.get("branchPrefixMode")?.note).toMatch(/host service/);
		expect(readings.get("branchPrefixMode")?.isSet).toBe(false);
		// local.db keys unaffected by host being down
		expect(readings.get("confirmOnQuit")?.note).toBeUndefined();
	});
});
