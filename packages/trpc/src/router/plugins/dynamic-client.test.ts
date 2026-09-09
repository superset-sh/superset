import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

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
	isNotNull: (...parts: unknown[]) => parts,
	lte: (...parts: unknown[]) => parts,
}));

const stored: Record<string, unknown>[] = [];
const inserted: Record<string, unknown>[] = [];

function chain() {
	let pending: Record<string, unknown> | undefined;
	const node: Record<string, unknown> = {
		limit: async () => stored,
		onConflictDoUpdate: async () => {
			if (pending && stored.length === 0) stored.push(pending);
		},
		values: (row: Record<string, unknown>) => {
			pending = row;
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
	body: unknown | (() => unknown);
	status?: number;
}

let routes: Record<string, Route>;
let requests: { url: string; method: string; body?: string }[];

const realFetch = global.fetch;

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
		const body =
			typeof route.body === "function"
				? (route.body as () => unknown)()
				: route.body;
		return new Response(JSON.stringify(body), {
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

	afterAll(() => {
		global.fetch = realFetch;
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
				marketplace: "superset",
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
				marketplace: "superset",
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

	test("concurrent connects converge on one registered client", async () => {
		const mcpUrl = "https://race.test/mcp";
		let issued = 0;
		serve({
			"https://race.test/.well-known/oauth-protected-resource/mcp": {
				body: {
					resource: "https://race.test/mcp",
					authorization_servers: ["https://race.test"],
				},
			},
			"https://race.test/.well-known/oauth-authorization-server": {
				body: {
					issuer: "https://race.test",
					authorization_endpoint: "https://race.test/authorize",
					token_endpoint: "https://race.test/token",
					registration_endpoint: "https://race.test/register",
					token_endpoint_auth_methods_supported: ["client_secret_post"],
				},
			},
			"https://race.test/register": {
				body: () => {
					issued += 1;
					return {
						client_id: `registered-${issued}`,
						client_secret: `secret-${issued}`,
					};
				},
				status: 201,
			},
		});

		const connect = () =>
			buildAuthorizationUrl("notion", auth, { inputs: {} }, "state", {
				marketplace: "superset",
				manifest: manifest(mcpUrl),
				codeVerifier: "verifier",
			});
		const [first, second] = await Promise.all([connect(), connect()]);

		expect(new URL(first).searchParams.get("client_id")).toBe(
			new URL(second).searchParams.get("client_id"),
		);
		expect(issued).toBe(1);
		expect(stored[0]?.clientId).toBe("registered-1");
	});

	test("a later connect reuses the persisted client, not its own registration", async () => {
		stored.push({
			clientId: "persisted-id",
			clientSecret: "enc:persisted-secret",
			clientSecretExpiresAt: null,
			tokenEndpointAuthMethod: "client_secret_post",
		});
		const mcpUrl = "https://reuse.test/mcp";
		serve({
			"https://reuse.test/.well-known/oauth-protected-resource/mcp": {
				body: {
					resource: "https://reuse.test/mcp",
					authorization_servers: ["https://reuse.test"],
				},
			},
			"https://reuse.test/.well-known/oauth-authorization-server": {
				body: {
					issuer: "https://reuse.test",
					authorization_endpoint: "https://reuse.test/authorize",
					token_endpoint: "https://reuse.test/token",
					registration_endpoint: "https://reuse.test/register",
				},
			},
		});

		const url = new URL(
			await buildAuthorizationUrl("notion", auth, { inputs: {} }, "state", {
				marketplace: "superset",
				manifest: manifest(mcpUrl),
				codeVerifier: "verifier",
			}),
		);

		expect(url.searchParams.get("client_id")).toBe("persisted-id");
		expect(requests.some((r) => r.url.endsWith("/register"))).toBe(false);
	});

	test("says what is missing when the plugin declares no mcp url", async () => {
		serve({});
		expect(
			buildAuthorizationUrl("notion", auth, { inputs: {} }, "state", {
				marketplace: "superset",
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
				marketplace: "superset",
				manifest: manifest(mcpUrl),
			}),
		).rejects.toThrow(/names no https authorization server/);
	});

	test("refuses an authorization_endpoint the server advertises over http", async () => {
		const mcpUrl = "https://cleartext.test/mcp";
		serve({
			"https://cleartext.test/.well-known/oauth-protected-resource/mcp": {
				body: {
					resource: "https://cleartext.test/mcp",
					authorization_servers: ["https://cleartext.test"],
				},
			},
			"https://cleartext.test/.well-known/oauth-authorization-server": {
				body: {
					issuer: "https://cleartext.test",
					authorization_endpoint: "http://cleartext.test/authorize",
					token_endpoint: "https://cleartext.test/token",
				},
			},
		});

		expect(
			buildAuthorizationUrl("notion", auth, { inputs: {} }, "state", {
				marketplace: "superset",
				manifest: manifest(mcpUrl),
			}),
		).rejects.toThrow(/authorization_endpoint of http:/);
	});

	test("refuses dynamic registration for a plugin outside the first-party marketplace", async () => {
		const mcpUrl = "https://third-party.test/mcp";
		serve({});

		expect(
			buildAuthorizationUrl("notion", auth, { inputs: {} }, "state", {
				marketplace: "community",
				manifest: manifest(mcpUrl),
			}),
		).rejects.toThrow(/Only first-party plugins/);
		expect(requests).toHaveLength(0);
	});
});
