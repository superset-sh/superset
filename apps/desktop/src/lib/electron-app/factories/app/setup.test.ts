import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

/**
 * Regression test for #5948: on Linux the app called
 * `app.disableHardwareAcceleration()` at module load, forcing every Linux user
 * onto SwiftShader software rasterization — the CPU fan ramped on launch and
 * never spun down, even while the app was idle.
 *
 * `PLATFORM` is derived from `process.platform` at module load, so the platform
 * has to be pinned before `./setup` is imported.
 */

const appliedSwitches: Array<[string, string | undefined]> = [];
const disableHardwareAcceleration = mock(() => {});

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");

beforeAll(async () => {
	Object.defineProperty(process, "platform", {
		value: "linux",
		configurable: true,
	});

	mock.module("electron", () => ({
		app: {
			disableHardwareAcceleration,
			commandLine: {
				appendSwitch: mock((key: string, value?: string) => {
					appliedSwitches.push([key, value]);
				}),
				hasSwitch: mock(() => false),
				getSwitchValue: mock(() => ""),
			},
			on: mock(() => {}),
			setAppUserModelId: mock(() => {}),
			quit: mock(() => {}),
			getPath: mock(() => "/tmp/superset-test"),
			isPackaged: false,
		},
		BrowserWindow: { getAllWindows: mock(() => []) },
		session: {
			fromPartition: mock(() => ({
				getAllExtensions: mock(() => []),
				loadExtension: mock(() => Promise.resolve({})),
			})),
		},
		shell: { openExternal: mock(() => Promise.resolve()) },
	}));

	await import("./setup");
});

afterAll(() => {
	if (originalPlatform) {
		Object.defineProperty(process, "platform", originalPlatform);
	}
});

describe("app setup GPU configuration (Linux, no opt-out flags)", () => {
	test("does not disable hardware acceleration", () => {
		expect(disableHardwareAcceleration).not.toHaveBeenCalled();
	});

	test("does not swap in an equivalent blanket GPU switch", () => {
		const names = appliedSwitches.map(([name]) => name);
		expect(names).not.toContain("disable-gpu");
		expect(names).not.toContain("disable-gpu-compositing");
		expect(names).not.toContain("disable-gpu-rasterization");
	});

	test("still raises the WebGL context cap for parked xterm panes", () => {
		expect(appliedSwitches).toContainEqual([
			"max-active-webgl-contexts",
			"256",
		]);
	});
});
