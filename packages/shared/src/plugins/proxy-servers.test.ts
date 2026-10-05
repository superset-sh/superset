import { describe, expect, test } from "bun:test";
import { desiredPluginMcpServers, pluginProxyMcpServers } from "./index";

// The plugin's connector slug, which is not its name — the Linear plugin reaches
// `linear_mcp`, while `linear` is the sync integration's own connector.
const CONNECTOR = "linear_mcp";

const WORK = {
	connector: CONNECTOR,
	connectionId: "conn-work",
	externalUserId: "9f8a7c6b",
};
const SIDE = {
	connector: CONNECTOR,
	connectionId: "conn-side",
	externalUserId: "1c2d3e4f",
};

/**
 * An unpinned entry 409s on every request once a connector holds two accounts,
 * tool list included — so the agent sees the plugin with no tools at all. The
 * entry names are how an agent expresses which account it means.
 */
describe("pluginProxyMcpServers", () => {
	test("one account keeps the plain name and an unpinned url", () => {
		const servers = pluginProxyMcpServers("linear", "superset", {
			connections: [WORK],
		});
		expect(Object.keys(servers ?? {})).toEqual(["linear"]);
		expect((servers?.linear as { url: string }).url).not.toContain(
			"connection=",
		);
	});

	// Renaming the single entry the moment a second arrives would orphan the
	// token the agent stored against the old name.
	test("no connections also keeps the plain name", () => {
		const servers = pluginProxyMcpServers("linear", "superset", {});
		expect(Object.keys(servers ?? {})).toEqual(["linear"]);
	});

	test("two accounts split into one pinned entry each", () => {
		const servers = pluginProxyMcpServers("linear", "superset", {
			connections: [WORK, SIDE],
		});
		expect(Object.keys(servers ?? {}).sort()).toEqual([
			"linear-1c2d3e4f",
			"linear-9f8a7c6b",
		]);
		expect((servers?.["linear-9f8a7c6b"] as { url: string }).url).toContain(
			"connection=conn-work",
		);
	});

	// The agent reads these names to choose an account, so a word the person
	// recognizes beats an id that is merely correct.
	test("prefers the nickname the person set", () => {
		const servers = pluginProxyMcpServers("linear", "superset", {
			connections: [
				{ ...WORK, nickname: "Work" },
				{ ...SIDE, nickname: "Side project" },
			],
		});
		expect(Object.keys(servers ?? {}).sort()).toEqual([
			"linear-side-project",
			"linear-work",
		]);
	});

	test("falls back to the provider's label when no nickname is set", () => {
		const servers = pluginProxyMcpServers("linear", "superset", {
			connections: [
				{ ...WORK, label: "harshith@tegon.ai" },
				{ ...SIDE, label: "me@personal.dev" },
			],
		});
		expect(Object.keys(servers ?? {}).sort()).toEqual([
			"linear-harshith-tegon-ai",
			"linear-me-personal-dev",
		]);
	});

	// All or nothing: a label for one account beside a raw id for its twin reads
	// as two unrelated schemes, and the reader cannot tell which is which.
	test("drops to ids when only one account has a name", () => {
		const servers = pluginProxyMcpServers("linear", "superset", {
			connections: [{ ...WORK, nickname: "Work" }, SIDE],
		});
		expect(Object.keys(servers ?? {}).sort()).toEqual([
			"linear-1c2d3e4f",
			"linear-9f8a7c6b",
		]);
	});

	test("drops to ids when two names slug to the same word", () => {
		const servers = pluginProxyMcpServers("linear", "superset", {
			connections: [
				{ ...WORK, nickname: "Work (main)" },
				{ ...SIDE, nickname: "Work [main]" },
			],
		});
		expect(Object.keys(servers ?? {}).sort()).toEqual([
			"linear-1c2d3e4f",
			"linear-9f8a7c6b",
		]);
	});

	test("falls back to the connection id when the provider gave no user id", () => {
		const servers = pluginProxyMcpServers("linear", "superset", {
			connections: [
				{ ...WORK, externalUserId: null },
				{ ...SIDE, externalUserId: null },
			],
		});
		expect(Object.keys(servers ?? {}).sort()).toEqual([
			"linear-conn-side",
			"linear-conn-work",
		]);
	});

	test("another connector's accounts never split this plugin's entry", () => {
		const servers = pluginProxyMcpServers("linear", "superset", {
			connections: [
				WORK,
				{ connector: "github", connectionId: "gh", externalUserId: "gh-1" },
			],
		});
		expect(Object.keys(servers ?? {})).toEqual(["linear"]);
	});

	test("carries the headers helper onto every entry", () => {
		const servers = pluginProxyMcpServers("linear", "superset", {
			connections: [WORK, SIDE],
			headersHelper: "/bin/superset auth mcp-headers",
		});
		for (const config of Object.values(servers ?? {})) {
			expect((config as { headersHelper?: string }).headersHelper).toBe(
				"/bin/superset auth mcp-headers",
			);
		}
	});
});

describe("desiredPluginMcpServers", () => {
	test("splits an installed plugin's entries by account", () => {
		const desired = desiredPluginMcpServers([{ name: "linear" }], {
			connections: [WORK, SIDE],
		});
		expect(Object.keys(desired).sort()).toEqual([
			"linear-1c2d3e4f",
			"linear-9f8a7c6b",
		]);
	});

	test("a disabled install contributes nothing, which is what reaps it", () => {
		const desired = desiredPluginMcpServers([
			{ name: "linear", enabled: false },
		]);
		expect(desired).toEqual({});
	});
});
