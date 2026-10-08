import { describe, expect, test } from "bun:test";
import { desiredPluginMcpServers, pluginProxyMcpServers } from "./index";

function url(config: unknown): string {
	return (config as { url: string }).url;
}

describe("pluginProxyMcpServers", () => {
	test("is one entry under the plugin's plain name", () => {
		const servers = pluginProxyMcpServers("linear", "superset");

		expect(Object.keys(servers ?? {})).toEqual(["linear"]);
		expect(url(servers?.linear)).toBe(
			"https://api.superset.sh/mcp/plugins/superset/linear",
		);
	});

	test("pins no account in the url", () => {
		expect(
			url(pluginProxyMcpServers("linear", "superset")?.linear),
		).not.toContain("connection=");
	});

	test("carries the headers helper, so the entry needs no OAuth of its own", () => {
		const servers = pluginProxyMcpServers("linear", "superset", {
			headersHelper: "/bin/superset auth mcp-headers",
		});

		expect((servers?.linear as { headersHelper?: string }).headersHelper).toBe(
			"/bin/superset auth mcp-headers",
		);
	});

	test("a plugin that names no connector exposes no proxy entry", () => {
		expect(
			pluginProxyMcpServers("chrome-devtools", "superset"),
		).toBeUndefined();
	});
});

describe("desiredPluginMcpServers", () => {
	test("is one entry per installed plugin", () => {
		const desired = desiredPluginMcpServers([
			{ name: "linear" },
			{ name: "gmail" },
		]);

		expect(Object.keys(desired).sort()).toEqual(["gmail", "linear"]);
	});

	test("a disabled install contributes nothing, which is what reaps it", () => {
		expect(
			desiredPluginMcpServers([{ name: "linear", enabled: false }]),
		).toEqual({});
	});

	test("an absent marketplace is the first-party one", () => {
		const desired = desiredPluginMcpServers([{ name: "linear" }]);
		expect(Object.keys(desired)).toEqual(["linear"]);
		expect((desired.linear as { url: string }).url).toContain(
			"/mcp/plugins/superset/linear",
		);
	});

	test("another marketplace's same-named plugin is not served Superset's", () => {
		const desired = desiredPluginMcpServers([
			{ name: "linear", marketplace: "acme" },
		]);
		expect(desired).toEqual({});
	});
});
