import { describe, expect, test } from "bun:test";
import { getPluginByName, PLUGIN_CATALOG } from "./index";
import { FIRST_PARTY_MANIFESTS } from "./manifests.generated";

describe("PLUGIN_CATALOG", () => {
	test("covers every published first-party manifest", () => {
		const missing = Object.keys(FIRST_PARTY_MANIFESTS).filter(
			(name) => !getPluginByName(name),
		);
		expect(missing).toEqual([]);
	});

	test("agrees with each manifest on display name", () => {
		for (const [name, manifest] of Object.entries(FIRST_PARTY_MANIFESTS)) {
			expect(getPluginByName(name)?.interface.displayName).toBe(
				manifest.extensions.superset.interface.displayName,
			);
		}
	});

	test("has no duplicate names", () => {
		const names = PLUGIN_CATALOG.map((plugin) => plugin.name);
		expect(names).toEqual([...new Set(names)]);
	});
});
