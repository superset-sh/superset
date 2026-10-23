import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import {
	createLocalSettingsDb,
	withTempSupersetHome,
} from "../../../lib/settings/test-helpers";
import { default as getCommand } from "../get/command";
import { default as listCommand } from "../list/command";
import { default as resetCommand } from "../reset/command";
import { default as setCommand } from "../set/command";

const home = withTempSupersetHome("superset-cli-settings-cmd-");

function invoke(
	cmd:
		| typeof setCommand
		| typeof getCommand
		| typeof resetCommand
		| typeof listCommand,
	args: Record<string, string> = {},
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

describe("hideEmptySidebarProjects", () => {
	let desktop: ReturnType<typeof Bun.serve> | undefined;
	let previousPort: string | undefined;

	beforeEach(() => {
		previousPort = process.env.DESKTOP_NOTIFICATIONS_PORT;
	});

	afterEach(() => {
		desktop?.stop(true);
		desktop = undefined;
		if (previousPort === undefined)
			delete process.env.DESKTOP_NOTIFICATIONS_PORT;
		else process.env.DESKTOP_NOTIFICATIONS_PORT = previousPort;
	});

	test("set writes the value and nudges the running desktop app", async () => {
		const nudges: string[] = [];
		desktop = Bun.serve({
			port: 0,
			fetch: (req) => {
				nudges.push(new URL(req.url).pathname);
				return new Response(JSON.stringify({ success: true }));
			},
		});
		process.env.DESKTOP_NOTIFICATIONS_PORT = String(desktop.port);

		const result = (await invoke(setCommand, {
			key: "hideEmptySidebarProjects",
			value: "true",
		})) as { message: string };

		expect(nudges).toEqual(["/settings-changed"]);
		expect(result.message).toContain("refreshed immediately");
		const reading = (await invoke(getCommand, {
			key: "hideEmptySidebarProjects",
		})) as { data: { value: unknown; isSet: boolean } };
		expect(reading.data).toMatchObject({ value: true, isSet: true });
	});

	test("an older desktop database keeps list and get working and refuses the new key", async () => {
		rmSync(join(home.dir, "local.db"));
		createLocalSettingsDb(home.dir, 1, {
			omitColumns: ["hide_empty_sidebar_projects"],
		});
		process.env.DESKTOP_NOTIFICATIONS_PORT = "9";

		const list = (await invoke(listCommand)) as {
			data: { key: string; value: string; isSet: boolean }[];
		};
		expect(
			list.data.find((row) => row.key === "hideEmptySidebarProjects"),
		).toMatchObject({ value: "false", isSet: false });
		expect(list.data.find((row) => row.key === "confirmOnQuit")).toMatchObject({
			value: "true",
			isSet: true,
		});

		const reading = (await invoke(getCommand, {
			key: "hideEmptySidebarProjects",
		})) as { data: { value: unknown; isSet: boolean } };
		expect(reading.data).toMatchObject({ value: false, isSet: false });

		await expect(
			invoke(setCommand, { key: "hideEmptySidebarProjects", value: "true" }),
		).rejects.toMatchObject({
			suggestion: expect.stringMatching(/Update the Superset desktop app/),
		});
		await invoke(setCommand, { key: "confirmOnQuit", value: "false" });
		const confirm = (await invoke(getCommand, { key: "confirmOnQuit" })) as {
			data: { value: unknown };
		};
		expect(confirm.data.value).toBe(false);
	});
});
