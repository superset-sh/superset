import { describe, expect, test } from "bun:test";
import { managedPluginsKey } from "./managedPluginsKey";

const plugin = (
	name: string,
	marketplace: string,
	managed: boolean,
	latestVersion: string | null = "1.0.0",
) => ({ name, marketplace, managed, latestVersion });

describe("managedPluginsKey", () => {
	test("changes only with the organization's managed plugins and their versions", () => {
		const base = [
			plugin("deploy", "organization-org1", true),
			plugin("lint", "organization-org1", false),
			plugin("linear", "superset", false),
		];
		const key = managedPluginsKey(base);

		expect(managedPluginsKey([...base].reverse())).toBe(key);
		expect(
			managedPluginsKey([...base, plugin("notes", "organization-org1", false)]),
		).toBe(key);
		expect(
			managedPluginsKey([plugin("deploy", "organization-org1", true, "1.1.0")]),
		).not.toBe(key);
		expect(managedPluginsKey([])).not.toBe(key);
	});
});
