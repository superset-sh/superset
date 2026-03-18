import { describe, expect, mock, test } from "bun:test";

/**
 * Reproduction and fix verification for:
 * https://github.com/anthropics/superset/issues/2568
 *
 * CDP (Chrome DevTools Protocol) must NOT be unconditionally enabled at app
 * startup. It should only activate when DESKTOP_AUTOMATION_ENABLED=true, must
 * not default to a fixed port, and must not use wildcard remote-allow-origins.
 *
 * Because setup.ts uses top-level side effects that run once at import time,
 * we capture all appendSwitch calls from a single import where
 * DESKTOP_AUTOMATION_ENABLED is NOT set, then verify CDP switches are absent.
 */

// ── Track appendSwitch calls ────────────────────────────────────────────────
const appendSwitchCalls: [string, string][] = [];

// Ensure DESKTOP_AUTOMATION_ENABLED is unset before the module loads.
// This simulates a normal app launch without explicit automation opt-in.
delete process.env.DESKTOP_AUTOMATION_ENABLED;
delete process.env.DESKTOP_AUTOMATION_PORT;

mock.module("electron", () => ({
	app: {
		getPath: mock(() => "/tmp"),
		getName: mock(() => "test-app"),
		getVersion: mock(() => "1.0.0"),
		getAppPath: mock(() => "/tmp"),
		isPackaged: false,
		on: mock(() => {}),
		quit: mock(() => {}),
		commandLine: {
			appendSwitch: mock((flag: string, value?: string) => {
				appendSwitchCalls.push([flag, value ?? ""]);
			}),
		},
		disableHardwareAcceleration: mock(() => {}),
		setAppUserModelId: mock(() => {}),
	},
	BrowserWindow: Object.assign(
		mock(() => ({})),
		{
			getAllWindows: mock(() => []),
		},
	),
	shell: {
		openExternal: mock(() => Promise.resolve()),
	},
	nativeTheme: { shouldUseDarkColors: false },
}));

mock.module("main/env.main", () => ({
	env: { NODE_ENV: "test" },
}));
mock.module("main/lib/extensions", () => ({
	loadReactDevToolsExtension: mock(() => Promise.resolve()),
}));
mock.module("shared/constants", () => ({
	PLATFORM: { IS_MAC: false, IS_LINUX: false, IS_WINDOWS: false },
}));
mock.module("shared/utils", () => ({
	makeAppId: mock(() => "test-app-id"),
}));

// Import triggers all top-level side effects in setup.ts
await import("./setup.ts");

// ── Tests ───────────────────────────────────────────────────────────────────

describe("CDP security hardening (#2568)", () => {
	test("CDP is NOT enabled when DESKTOP_AUTOMATION_ENABLED is unset", () => {
		const cdpSwitch = appendSwitchCalls.find(
			([flag]) => flag === "remote-debugging-port",
		);
		expect(cdpSwitch).toBeUndefined();
	});

	test("wildcard remote-allow-origins is never set", () => {
		const originsSwitch = appendSwitchCalls.find(
			([flag, value]) => flag === "remote-allow-origins" && value === "*",
		);
		expect(originsSwitch).toBeUndefined();
	});

	test("no fixed default port 41729 in appendSwitch calls", () => {
		const fixedPortSwitch = appendSwitchCalls.find(
			([flag, value]) => flag === "remote-debugging-port" && value === "41729",
		);
		expect(fixedPortSwitch).toBeUndefined();
	});

	test("non-CDP switches (e.g. force-color-profile) are still applied", () => {
		const colorProfile = appendSwitchCalls.find(
			([flag]) => flag === "force-color-profile",
		);
		expect(colorProfile).toBeDefined();
		expect(colorProfile?.[1]).toBe("srgb");
	});
});
