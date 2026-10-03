import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readEnabledPlugins } from "./installed-plugins";

let dir: string;
let file: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "ledger-"));
	file = join(dir, "installed_plugins.json");
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("readEnabledPlugins", () => {
	it("reads the enabled entries with their marketplace, skipping the disabled", () => {
		writeFileSync(
			file,
			JSON.stringify({
				version: 1,
				plugins: [
					{ name: "linear", marketplace: "superset", enabled: true },
					{ name: "sentry", marketplace: "superset", enabled: false },
					{ name: "figma", marketplace: "acme" },
				],
			}),
		);

		expect(readEnabledPlugins(file)).toEqual([
			{ name: "linear", marketplace: "superset" },
			{ name: "figma", marketplace: "acme" },
		]);
	});

	it("reports no plugins when the ledger does not exist", () => {
		expect(readEnabledPlugins(file)).toEqual([]);
	});

	it("reports an unreadable ledger as null, not as no plugins", () => {
		writeFileSync(file, "{not json");
		expect(readEnabledPlugins(file)).toBeNull();

		writeFileSync(file, JSON.stringify({ version: 1 }));
		expect(readEnabledPlugins(file)).toBeNull();

		expect(readEnabledPlugins(dir)).toBeNull();
	});
});
