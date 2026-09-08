import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("../../env", () => ({
	env: {
		BETTER_AUTH_SECRET: "test-secret",
		NEXT_PUBLIC_API_URL: "https://api.test",
	},
}));

mock.module("./crypto", () => ({
	encryptSecret: async (value: string) => `enc:${value}`,
	decryptSecret: async (value: string) => value.replace(/^enc:/, ""),
	encryptOptional: async (value?: string | null) =>
		value ? `enc:${value}` : null,
	decryptOptional: async (value?: string | null) =>
		value ? value.replace(/^enc:/, "") : null,
}));

mock.module("drizzle-orm", () => ({
	and: (...parts: unknown[]) => parts,
	eq: (...parts: unknown[]) => parts,
}));

const stored: Record<string, unknown>[] = [];
const inserted: Record<string, unknown>[] = [];

function chain() {
	const node: Record<string, unknown> = {
		limit: async () => stored,
		onConflictDoUpdate: async () => undefined,
		values: (row: Record<string, unknown>) => {
			inserted.push(row);
			return node;
		},
	};
	for (const method of ["select", "from", "where", "returning"]) {
		node[method] = () => node;
	}
	return node;
}

mock.module("@superset/db/client", () => ({
	db: {
		select: () => chain(),
		insert: () => chain(),
		delete: () => chain(),
	},
}));

mock.module("@superset/db/schema", () => ({
	pluginOauthClients: { issuer: "issuer", redirectUri: "redirect_uri" },
}));

const { buildAuthorizationUrl } = await import("./oauth");

interface Route {
	body: unknown;
	status?: number;
}

let routes: Record<string, Route>;
let requests: { url: string; method: string; body?: string }[];

function serve(map: Record<string, Route>) {
	routes = map;
	requests = [];
	global.fetch = (async (input: string | URL, init?: RequestInit) => {
		const url = String(input);
		requests.push({
			url,
			method: init?.method ?? "GET",
			body: init?.body ? String(init.body) : undefined,
		});
		const route = routes[url];
		if (!route) return new Response("no route", { status: 404 });
		return new Response(JSON.stringify(route.body), {
			status: route.status ?? 200,
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

describe('oauth2 with client "dynamic"', () => {
	beforeEach(() => {
		stored.length = 0;
		inserted.length = 0;
	});

	test("uses a hosted client id metadata document when the server supports it", async () => {
		const mcpUrl = "https://cimd.test/mcp";
		serve({
			"https://cimd.test/.well-known/oauth-protected-resource/mcp": {
				body: {
					resource: "https://cimd.test/mcp",
					authorization_servers: ["https://cimd.test"],
				},
			},
			"https://cimd.test/.well-known/oauth-authorization-server": {
				body: {
					issuer: "https://cimd.test",
					authorization_endpoint: "https://cimd.test/authorize",
					token_endpoint: "https://cimd.test/token",
					registration_endpoint: "https://cimd.test/register",
					client_id_metadata_document_supported: true,
				},
			},
		});

		const url = new URL(
			await buildAuthorizationUrl("notion", auth, { inputs: {} }, "state", {
				manifest: manifest(mcpUrl),
				codeVerifier: "verifier",
			}),
		);

		expect(url.origin + url.pathname).toBe("https://cimd.test/authorize");
		expect(url.searchParams.get("client_id")).toBe(
			"https://api.test/api/plugins/notion/client-metadata",
		);
		expect(url.searchParams.get("resource")).toBe("https://cimd.test/mcp");
		expect(url.searchParams.get("code_challenge_method")).toBe("S256");
		expect(url.searchParams.get("code_challenge")).toBeTruthy();
		expect(requests.some((r) => r.method === "POST")).toBe(false);
	});

	test("registers a client when the server offers no metadata document", async () => {
		const mcpUrl = "https://dcr.test/mcp";
		serve({
			"https://dcr.test/.well-known/oauth-protected-resource/mcp": {
				body: {
					resource: "https://dcr.test/mcp",
					authorization_servers: ["https://dcr.test"],
				},
			},
			"https://dcr.test/.well-known/oauth-authorization-server": {
				body: {
					issuer: "https://dcr.test",
					authorization_endpoint: "https://dcr.test/authorize",
					token_endpoint: "https://dcr.test/token",
					registration_endpoint: "https://dcr.test/register",
					token_endpoint_auth_methods_supported: ["client_secret_post"],
				},
			},
			"https://dcr.test/register": {
				body: {
					client_id: "registered-id",
					client_secret: "registered-secret",
				},
				status: 201,
			},
		});

		const url = new URL(
			await buildAuthorizationUrl("notion", auth, { inputs: {} }, "state", {
				manifest: manifest(mcpUrl),
				codeVerifier: "verifier",
			}),
		);

		expect(url.searchParams.get("client_id")).toBe("registered-id");
		const registration = requests.find((r) => r.url.endsWith("/register"));
		expect(registration?.method).toBe("POST");
		expect(JSON.parse(registration?.body ?? "{}").redirect_uris).toEqual([
			"https://api.test/api/plugins/callback/notion",
		]);
		expect(inserted[0]?.clientId).toBe("registered-id");
		expect(inserted[0]?.clientSecret).toBe("enc:registered-secret");
	});

	test("says what is missing when the plugin declares no mcp url", async () => {
		serve({});
		expect(
			buildAuthorizationUrl("notion", auth, { inputs: {} }, "state", {
				manifest: { name: "notion", version: "1.0.0" },
			}),
		).rejects.toThrow(/declares no mcp url/);
	});

	test("refuses an authorization server the resource does not name over https", async () => {
		const mcpUrl = "https://plain.test/mcp";
		serve({
			"https://plain.test/.well-known/oauth-protected-resource/mcp": {
				body: {
					resource: "https://plain.test/mcp",
					authorization_servers: ["http://plain.test"],
				},
			},
		});

		expect(
			buildAuthorizationUrl("notion", auth, { inputs: {} }, "state", {
				manifest: manifest(mcpUrl),
			}),
		).rejects.toThrow(/names no https authorization server/);
	});
});
