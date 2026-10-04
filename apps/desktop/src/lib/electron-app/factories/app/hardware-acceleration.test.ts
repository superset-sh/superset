import { describe, expect, mock, test } from "bun:test";
import {
	applyHardwareAccelerationPolicy,
	shouldDisableHardwareAcceleration,
} from "./hardware-acceleration";

const fakeApp = () => ({ disableHardwareAcceleration: mock(() => {}) });

describe("shouldDisableHardwareAcceleration", () => {
	// Regression: Linux launches forced Chromium onto the SwiftShader CPU
	// rasterizer, pinning cores and ramping the fan for the whole session.
	test("keeps the GPU enabled on Linux by default", () => {
		expect(
			shouldDisableHardwareAcceleration({
				platform: "linux",
				argv: ["/opt/Superset/superset"],
				env: {},
			}),
		).toBe(false);
	});

	test.each([
		"darwin",
		"win32",
		"linux",
		"freebsd",
	])("keeps the GPU enabled on %s by default", (platform) => {
		expect(
			shouldDisableHardwareAcceleration({ platform, argv: [], env: {} }),
		).toBe(false);
	});

	test.each([
		"--disable-gpu",
		"--disable-hardware-acceleration",
	])("disables hardware acceleration when %s is passed", (flag) => {
		expect(
			shouldDisableHardwareAcceleration({
				platform: "linux",
				argv: ["/opt/Superset/superset", flag],
				env: {},
			}),
		).toBe(true);
	});

	test("accepts --disable-gpu with an appended value", () => {
		expect(
			shouldDisableHardwareAcceleration({
				platform: "linux",
				argv: ["--disable-gpu=1"],
				env: {},
			}),
		).toBe(true);
	});

	test.each([
		"1",
		"true",
		"TRUE",
		"yes",
		"on",
	])("disables hardware acceleration when SUPERSET_DISABLE_GPU=%s", (value) => {
		expect(
			shouldDisableHardwareAcceleration({
				platform: "linux",
				argv: [],
				env: { SUPERSET_DISABLE_GPU: value },
			}),
		).toBe(true);
	});

	test.each([
		"",
		"0",
		"false",
		"no",
		"off",
	])("ignores SUPERSET_DISABLE_GPU=%s", (value) => {
		expect(
			shouldDisableHardwareAcceleration({
				platform: "darwin",
				argv: [],
				env: { SUPERSET_DISABLE_GPU: value },
			}),
		).toBe(false);
	});

	test("honours the opt-out on macOS and Windows too", () => {
		for (const platform of ["darwin", "win32"]) {
			expect(
				shouldDisableHardwareAcceleration({
					platform,
					argv: [],
					env: { SUPERSET_DISABLE_GPU: "1" },
				}),
			).toBe(true);
		}
	});
});

describe("applyHardwareAccelerationPolicy", () => {
	test("does not touch Electron's GPU switch on a default Linux launch", () => {
		const app = fakeApp();

		expect(
			applyHardwareAccelerationPolicy(app, {
				platform: "linux",
				argv: ["/opt/Superset/superset"],
				env: {},
			}),
		).toBe(false);
		expect(app.disableHardwareAcceleration).not.toHaveBeenCalled();
	});

	test("calls disableHardwareAcceleration when the user opts out", () => {
		const app = fakeApp();

		expect(
			applyHardwareAccelerationPolicy(app, {
				platform: "linux",
				argv: [],
				env: { SUPERSET_DISABLE_GPU: "1" },
			}),
		).toBe(true);
		expect(app.disableHardwareAcceleration).toHaveBeenCalledTimes(1);
	});
});
