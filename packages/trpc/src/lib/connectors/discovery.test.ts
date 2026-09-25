import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { discoverServer } from "./discovery";

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

describe("dynamic client discovery", () => {
	beforeEach(() => {
		serve({});
	});

	afterAll(() => {
		global.fetch = realFetch;
	});

	test("refuses an authorization server the resource does not name over https", async () => {
		serve({
			"https://plain.test/.well-known/oauth-protected-resource/mcp": {
				resource: "https://plain.test/mcp",
				authorization_servers: ["http://plain.test"],
			},
		});

		expect(discoverServer("https://plain.test/mcp")).rejects.toThrow(
			/names no https authorization server/,
		);
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

		expect(discoverServer("https://cleartext.test/mcp")).rejects.toThrow(
			/authorization_endpoint of http:/,
		);
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

		expect(discoverServer("https://swap.test/mcp")).rejects.toThrow(
			/may only describe the issuer/,
		);
	});

	test("resolves a well-formed server", async () => {
		serve({
			"https://ok.test/.well-known/oauth-protected-resource/mcp": {
				resource: "https://ok.test/mcp",
				authorization_servers: ["https://ok.test"],
			},
			"https://ok.test/.well-known/oauth-authorization-server": {
				issuer: "https://ok.test",
				authorization_endpoint: "https://ok.test/authorize",
				token_endpoint: "https://ok.test/token",
				registration_endpoint: "https://ok.test/register",
			},
		});

		const server = await discoverServer("https://ok.test/mcp");
		expect(server.issuer).toBe("https://ok.test");
		expect(server.resource).toBe("https://ok.test/mcp");
		expect(server.metadata.registration_endpoint).toBe(
			"https://ok.test/register",
		);
	});
});
