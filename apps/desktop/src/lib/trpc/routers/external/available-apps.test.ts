import { describe, expect, spyOn, test } from "bun:test";
import {
	createExternalAppAvailabilityCache,
	detectAvailableExternalApps,
	MACOS_AVAILABILITY_SCRIPT,
	type MacOSAppDescriptor,
} from "./available-apps";

describe("detectAvailableExternalApps", () => {
	test("uses one batch and always includes Finder", async () => {
		let calls = 0;
		let descriptors: readonly MacOSAppDescriptor[] = [];
		const result = await detectAvailableExternalApps(
			"darwin",
			async (input) => {
				calls++;
				descriptors = input;
				return '["cursor","cursor","zed"]';
			},
		);

		expect(calls).toBe(1);
		expect(descriptors.length).toBeGreaterThan(1);
		expect(result).toEqual(["finder", "cursor", "zed"]);
	});

	test("does nothing outside macOS", async () => {
		let called = false;
		expect(
			await detectAvailableExternalApps("linux", async () => {
				called = true;
				return "[]";
			}),
		).toBeNull();
		expect(called).toBe(false);
	});

	test("rejects invalid detector output", async () => {
		await expect(
			detectAvailableExternalApps("darwin", async () => '["unknown"]'),
		).rejects.toThrow("Invalid macOS external-app availability response");
	});

	test("unwraps Objective-C nil results", () => {
		expect(MACOS_AVAILABILITY_SCRIPT).toContain("ObjC.unwrap(raw)");
	});
});

describe("createExternalAppAvailabilityCache", () => {
	test("shares one promise and falls back to null on failure", async () => {
		const warning = spyOn(console, "warn").mockImplementation(() => {});
		let calls = 0;
		const cache = createExternalAppAvailabilityCache(async () => {
			calls++;
			throw new Error("failed");
		});

		const first = cache();
		expect(cache()).toBe(first);
		expect(await first).toBeNull();
		expect(await cache()).toBeNull();
		expect(calls).toBe(1);
		expect(warning).toHaveBeenCalledTimes(1);
		warning.mockRestore();
	});
});
