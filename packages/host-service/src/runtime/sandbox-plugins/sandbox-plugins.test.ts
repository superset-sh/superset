import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	getAgentSetupTemplatesDir,
	pluginCachePath,
	readEnabledPlugins,
	readInstalledPluginSources,
	setAgentSetupTemplatesDir,
} from "@superset/agent-setup";
import { seedSandboxPlugins } from "./sandbox-plugins";

let home: string;
let templates: string;
let scratch: string[] = [];
const originalHome = process.env.SUPERSET_HOME_DIR;
const originalTemplatesEnv = process.env.SUPERSET_AGENT_TEMPLATES_DIR;
const originalTemplatesDir = getAgentSetupTemplatesDir();

function scratchDir(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	scratch.push(dir);
	return dir;
}

function shipPlugin(name: string, version: string): void {
	const dir = join(templates, "plugins", name);
	mkdirSync(join(dir, "skills"), { recursive: true });
	mkdirSync(join(dir, "extra"), { recursive: true });
	writeFileSync(join(dir, "extra", "thing.txt"), "kept");
	writeFileSync(join(dir, "plugin.json"), JSON.stringify({ name, version }));
}

function ledger(): { plugins: Record<string, unknown>[] } {
	return JSON.parse(
		readFileSync(join(home, "plugins", "installed_plugins.json"), "utf8"),
	);
}

beforeEach(() => {
	home = scratchDir("seed-home-");
	templates = scratchDir("seed-templates-");
	mkdirSync(join(templates, "plugins"), { recursive: true });
	process.env.SUPERSET_HOME_DIR = home;
	setAgentSetupTemplatesDir(templates);
});

afterEach(() => {
	if (originalHome === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = originalHome;
	if (originalTemplatesEnv === undefined)
		delete process.env.SUPERSET_AGENT_TEMPLATES_DIR;
	else process.env.SUPERSET_AGENT_TEMPLATES_DIR = originalTemplatesEnv;
	// Sibling test files share this process and the templates dir is global.
	setAgentSetupTemplatesDir(originalTemplatesDir);
	for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
	scratch = [];
});

describe("seedSandboxPlugins", () => {
	it("caches the shipped tree and points the ledger at the cache", async () => {
		shipPlugin("linear", "1.3.0");
		await seedSandboxPlugins({
			SUPERSET_SANDBOX_PLUGINS: JSON.stringify([
				{
					marketplace: "superset",
					name: "linear",
					version: "1.2.0",
					enabled: true,
				},
			]),
		});

		const cached = pluginCachePath("superset", "linear", "1.3.0");
		expect(ledger().plugins).toEqual([
			expect.objectContaining({
				marketplace: "superset",
				name: "linear",
				version: "1.3.0",
				installPath: cached,
				enabled: true,
			}),
		]);
		// The whole tree, so a plugin carrying more than skills survives.
		expect(existsSync(join(cached, "plugin.json"))).toBe(true);
		expect(existsSync(join(cached, "skills"))).toBe(true);
		expect(existsSync(join(cached, "extra", "thing.txt"))).toBe(true);
	});

	it("leaves no partial tree behind when the copy fails", async () => {
		shipPlugin("linear", "1.3.0");
		const cached = pluginCachePath("superset", "linear", "1.3.0");
		// A file where the parent directory has to go: the copy cannot land.
		mkdirSync(join(cached, ".."), { recursive: true });
		writeFileSync(cached, "in the way");

		await seedSandboxPlugins({
			SUPERSET_SANDBOX_PLUGINS: JSON.stringify([
				{
					marketplace: "superset",
					name: "linear",
					version: "1.3.0",
					enabled: true,
				},
			]),
		});

		expect(ledger().plugins).toEqual([
			expect.not.objectContaining({ installPath: expect.anything() }),
		]);
		expect(readdirSync(join(cached, "..")).sort()).toEqual(["1.3.0"]);
	});

	it("leaves an already cached tree alone", async () => {
		shipPlugin("linear", "1.3.0");
		const cached = pluginCachePath("superset", "linear", "1.3.0");
		mkdirSync(cached, { recursive: true });
		writeFileSync(join(cached, "plugin.json"), '{"name":"linear"}');

		await seedSandboxPlugins({
			SUPERSET_SANDBOX_PLUGINS: JSON.stringify([
				{
					marketplace: "superset",
					name: "linear",
					version: "1.3.0",
					enabled: true,
				},
			]),
		});

		expect(ledger().plugins[0]).toMatchObject({ installPath: cached });
		expect(existsSync(join(cached, "extra"))).toBe(false);
	});

	it("keeps a disabled install as a record that materializes nothing", async () => {
		shipPlugin("sentry", "1.0.0");
		await seedSandboxPlugins({
			SUPERSET_SANDBOX_PLUGINS: JSON.stringify([
				{
					marketplace: "superset",
					name: "sentry",
					version: "1.0.0",
					enabled: false,
				},
			]),
		});

		expect(ledger().plugins).toHaveLength(1);
		expect(ledger().plugins[0]).toMatchObject({ enabled: false });
		expect(readInstalledPluginSources()).toEqual([]);
		expect(readEnabledPlugins()).toEqual([]);
	});

	it("keeps another marketplace's same-named plugin tools-only", async () => {
		shipPlugin("linear", "1.3.0");
		await seedSandboxPlugins({
			SUPERSET_SANDBOX_PLUGINS: JSON.stringify([
				{
					marketplace: "acme",
					name: "linear",
					version: "1.0.0",
					enabled: true,
				},
			]),
		});

		expect(ledger().plugins).toEqual([
			expect.not.objectContaining({ installPath: expect.anything() }),
		]);
		expect(ledger().plugins[0]).toMatchObject({ version: "1.0.0" });
	});

	it("keeps a plugin with no tree, but without an installPath", async () => {
		shipPlugin("linear", "1.0.0");
		await seedSandboxPlugins({
			SUPERSET_SANDBOX_PLUGINS: JSON.stringify([
				{
					marketplace: "superset",
					name: "linear",
					version: "1.0.0",
					enabled: true,
				},
				{
					marketplace: "acme",
					name: "unshipped",
					version: "1.0.0",
					enabled: true,
				},
			]),
		});

		expect(ledger().plugins).toEqual([
			expect.objectContaining({
				name: "linear",
				installPath: expect.any(String),
			}),
			expect.not.objectContaining({ installPath: expect.anything() }),
		]);
	});

	it("writes nothing off a cloud workspace", async () => {
		await seedSandboxPlugins({});
		expect(() => ledger()).toThrow();
	});

	it("empties the ledger when the claim states no plugins", async () => {
		shipPlugin("linear", "1.0.0");
		await seedSandboxPlugins({
			SUPERSET_SANDBOX_PLUGINS: JSON.stringify([
				{
					marketplace: "superset",
					name: "linear",
					version: "1.0.0",
					enabled: true,
				},
			]),
		});
		expect(ledger().plugins).toHaveLength(1);

		await seedSandboxPlugins({ SUPERSET_SANDBOX_PLUGINS: "[]" });
		expect(ledger().plugins).toEqual([]);
	});

	it("keeps a plugin tools-only when no tree ships for it", async () => {
		await seedSandboxPlugins({
			SUPERSET_SANDBOX_PLUGINS: JSON.stringify([
				{
					marketplace: "superset",
					name: "linear",
					version: "1.0.0",
					enabled: true,
				},
			]),
		});

		expect(ledger().plugins).toEqual([
			expect.not.objectContaining({ installPath: expect.anything() }),
		]);
	});

	it("writes nothing when the conf value is unusable", async () => {
		await seedSandboxPlugins({ SUPERSET_SANDBOX_PLUGINS: "not json" });
		await seedSandboxPlugins({ SUPERSET_SANDBOX_PLUGINS: JSON.stringify({}) });
		expect(() => ledger()).toThrow();
	});
});
