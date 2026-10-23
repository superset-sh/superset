import { describe, expect, test } from "bun:test";
import fingerprintConfig from "./fingerprint.config.js";

const expoConfigSource = { type: "contents", id: "expoConfig" } as const;
const hook = (
	source: Parameters<typeof fingerprintConfig.fileHookTransform>[0],
	chunk: string,
) => fingerprintConfig.fileHookTransform(source, chunk, true, "utf8");

describe("the runtime fingerprint ignores the iOS display name", () => {
	const withoutName = JSON.stringify({
		ios: { infoPlist: { NSSupportsLiveActivities: true } },
		name: "Superset",
	});

	test("an expo config with a display name hashes like one without it", () => {
		const withName = JSON.stringify({
			ios: {
				infoPlist: {
					CFBundleDisplayName: "Other Name",
					NSSupportsLiveActivities: true,
				},
			},
			name: "Superset",
		});
		expect(hook(expoConfigSource, withName)).toBe(withoutName);
	});

	test("an expo config without a display name is left as it is", () => {
		expect(hook(expoConfigSource, withoutName)).toBe(withoutName);
	});

	test("other sources are left as they are", () => {
		const chunk = '{"CFBundleDisplayName":"Other Name"}';
		expect(hook({ type: "file", filePath: "eas.json" }, chunk)).toBe(chunk);
	});

	test("the brand constants are not a fingerprint input", () => {
		expect(fingerprintConfig.ignorePaths).toContain(
			"../../packages/shared/src/brand.ts",
		);
	});
});
