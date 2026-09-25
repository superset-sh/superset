import { beforeEach, describe, expect, test } from "bun:test";
import {
	createLocalSettingsDb,
	withTempSupersetHome,
} from "../../../lib/settings/test-helpers";
import { default as getCommand } from "../get/command";
import { default as resetCommand } from "../reset/command";
import { default as setCommand } from "../set/command";

const home = withTempSupersetHome("superset-cli-settings-cmd-");

function invoke(
	cmd: typeof setCommand | typeof getCommand | typeof resetCommand,
	args: Record<string, string>,
) {
	return cmd.run({
		ctx: {} as never,
		args: args as never,
		options: {} as never,
		signal: new AbortController().signal,
	});
}

beforeEach(() => {
	createLocalSettingsDb(home.dir);
});

describe("settings set/get/reset", () => {
	test("set then get round-trips a value", async () => {
		await invoke(setCommand, { key: "fileOpenMode", value: "new-tab" });
		const result = (await invoke(getCommand, { key: "fileOpenMode" })) as {
			data: { value: unknown; isSet: boolean };
			message: string;
		};
		expect(result.data.value).toBe("new-tab");
		expect(result.data.isSet).toBe(true);
		expect(result.message).toBe("new-tab");
	});

	test("get falls back to the app default when unset", async () => {
		const result = (await invoke(getCommand, { key: "confirmOnQuit" })) as {
			data: { value: unknown; isSet: boolean };
		};
		expect(result.data.value).toBe(true);
		expect(result.data.isSet).toBe(false);
	});

	test("set rejects invalid values before touching the database", async () => {
		await expect(
			invoke(setCommand, { key: "terminalFontSize", value: "99" }),
		).rejects.toThrow(/between/);
		const result = (await invoke(getCommand, {
			key: "terminalFontSize",
		})) as { data: { isSet: boolean } };
		expect(result.data.isSet).toBe(false);
	});

	test("reset returns a setting to default", async () => {
		await invoke(setCommand, { key: "notificationVolume", value: "20" });
		await invoke(resetCommand, { key: "notificationVolume" });
		const result = (await invoke(getCommand, {
			key: "notificationVolume",
		})) as { data: { value: unknown; isSet: boolean } };
		expect(result.data.value).toBe(100);
		expect(result.data.isSet).toBe(false);
	});

	test("unknown keys are rejected", async () => {
		await expect(
			invoke(setCommand, { key: "bogus", value: "1" }),
		).rejects.toThrow(/Unknown setting/);
	});
});
