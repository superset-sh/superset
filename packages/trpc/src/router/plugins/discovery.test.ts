import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("../../env", () => ({
	env: {
		BETTER_AUTH_SECRET: "test-secret",
		NEXT_PUBLIC_API_URL: "https://api.test",
	},
}));

const { buildAuthorizationUrl } = await import("./oauth");

const realFetch = global.fetch;

let requests: string[];

function serve(routes: Record<string, unknown>) {
	requests = [];
	global.fetch = (async (input: string | URL) => {
		const url = String(input);
		requests.push(url);
		if (!(url in routes)) return new Response("no route", { status: 404 });
		return new Response(JSON.stringify(routes[url]), {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
}

function manifest(mcpUrl: string) {
	return {
		name: "notion",
		version: "1.0.0",
		extensions: {
			superset: { mcp: { type: "streamable-http" as const, url: mcpUrl } },
		},
	};
}

const auth = { type: "oauth2" as const, client: "dynamic" as const };

describe("dynamic client discovery", () => {
	beforeEach(() => {
		serve({});
	});

	afterAll(() => {
		global.fetch = realFetch;
	});

	test("refuses a plugin outside the first-party marketplace", async () => {
		expect(
			buildAuthorizationUrl("notion", auth, { inputs: {} }, "state", {
				marketplace: "community",
				manifest: manifest("https://third-party.test/mcp"),
			}),
		).rejects.toThrow(/Only first-party plugins/);
		expect(requests).toHaveLength(0);
	});

	test("says what is missing when the plugin declares no mcp url", async () => {
		expect(
			buildAuthorizationUrl("notion", auth, { inputs: {} }, "state", {
				marketplace: "superset",
				manifest: { name: "notion", version: "1.0.0" },
			}),
		).rejects.toThrow(/declares no mcp url/);
	});

	test("refuses an authorization server the resource does not name over https", async () => {
		serve({
			"https://plain.test/.well-known/oauth-protected-resource/mcp": {
				resource: "https://plain.test/mcp",
				authorization_servers: ["http://plain.test"],
			},
		});

		expect(
			buildAuthorizationUrl("notion", auth, { inputs: {} }, "state", {
				marketplace: "superset",
				manifest: manifest("https://plain.test/mcp"),
			}),
		).rejects.toThrow(/names no https authorization server/);
	});

	test("refuses an authorization_endpoint the server advertises over http", async () => {
		serve({
			"https://cleartext.test/.well-known/oauth-protected-resource/mcp": {
				resource: "https://cleartext.test/mcp",
				authorization_servers: ["https://cleartext.test"],
			},
			"https://cleartext.test/.well-known/oauth-authorization-server": {
				issuer: "https://cleartext.test",
				authorization_endpoint: "http://cleartext.test/authorize",
				token_endpoint: "https://cleartext.test/token",
			},
		});

		expect(
			buildAuthorizationUrl("notion", auth, { inputs: {} }, "state", {
				marketplace: "superset",
				manifest: manifest("https://cleartext.test/mcp"),
			}),
		).rejects.toThrow(/authorization_endpoint of http:/);
	});

	test("refuses metadata that describes a different issuer", async () => {
		serve({
			"https://swap.test/.well-known/oauth-protected-resource/mcp": {
				resource: "https://swap.test/mcp",
				authorization_servers: ["https://swap.test"],
			},
			"https://swap.test/.well-known/oauth-authorization-server": {
				issuer: "https://elsewhere.test",
				authorization_endpoint: "https://swap.test/authorize",
				token_endpoint: "https://swap.test/token",
			},
		});

		expect(
			buildAuthorizationUrl("notion", auth, { inputs: {} }, "state", {
				marketplace: "superset",
				manifest: manifest("https://swap.test/mcp"),
			}),
		).rejects.toThrow(/may only describe the issuer/);
	});
});
