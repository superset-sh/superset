import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("../../env", () => ({
	env: {
		BETTER_AUTH_SECRET: "test-secret",
		NEXT_PUBLIC_API_URL: "https://api.test",
	},
}));

const { buildAuthorizationUrl, clientCredentials, redirectUri } = await import(
	"./oauth"
);

describe("clientCredentials", () => {
	const vars = [
		"PLUGIN_LINEAR_CLIENT_ID",
		"PLUGIN_LINEAR_CLIENT_SECRET",
		"PLUGIN_GITHUB_CLIENT_SECRET",
		"ADMIN_CLIENT_ID",
		"ADMIN_CLIENT_SECRET",
		"BETTER_AUTH_SECRET",
	];
	const saved = new Map(vars.map((name) => [name, process.env[name]]));

	afterEach(() => {
		for (const name of vars) {
			const value = saved.get(name);
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	});

	const method = (requires_env: string[]) => ({
		type: "oauth2" as const,
		requires_env,
	});

	test("reads the pair the manifest names", () => {
		process.env.PLUGIN_LINEAR_CLIENT_ID = "id";
		process.env.PLUGIN_LINEAR_CLIENT_SECRET = "secret";

		expect(
			clientCredentials(
				method(["PLUGIN_LINEAR_CLIENT_ID", "PLUGIN_LINEAR_CLIENT_SECRET"]),
			),
		).toEqual({ clientId: "id", clientSecret: "secret" });
	});

	// The point of naming them: an OAuth client belongs to the service, so a
	// second plugin for it shares the pair rather than needing its own app.
	test("lets a differently named plugin share one service's client", () => {
		process.env.PLUGIN_LINEAR_CLIENT_ID = "id";
		process.env.PLUGIN_LINEAR_CLIENT_SECRET = "secret";

		expect(
			clientCredentials(
				method(["PLUGIN_LINEAR_CLIENT_ID", "PLUGIN_LINEAR_CLIENT_SECRET"]),
			),
		).not.toBeNull();
	});

	test("returns null when only one half is set", () => {
		process.env.PLUGIN_LINEAR_CLIENT_ID = "id";
		delete process.env.PLUGIN_LINEAR_CLIENT_SECRET;

		expect(
			clientCredentials(
				method(["PLUGIN_LINEAR_CLIENT_ID", "PLUGIN_LINEAR_CLIENT_SECRET"]),
			),
		).toBeNull();
	});

	test("returns null when the manifest names nothing", () => {
		expect(clientCredentials(method([]))).toBeNull();
	});

	// The exchange POSTs whatever this reads to a manifest-supplied token_url,
	// so a name outside the client namespace would leak an unrelated secret.
	// Each case names a pair that is shaped like a client but sits outside
	// PLUGIN_*, so only the namespace guard can reject it.
	test.each([
		["ADMIN_CLIENT_ID", "ADMIN_CLIENT_SECRET"],
		["plugin_linear_client_id", "plugin_linear_client_secret"],
	])("refuses to read %s", (id, secret) => {
		process.env[id] = "id";
		process.env[secret] = "server-secret";

		expect(clientCredentials(method([id, secret]))).toBeNull();
	});

	// Both halves are real client variables and both are set, so only the
	// same-service pairing keeps GitHub's secret out of Linear's exchange.
	test("refuses a pair split across two services", () => {
		process.env.PLUGIN_LINEAR_CLIENT_ID = "linear-id";
		process.env.PLUGIN_GITHUB_CLIENT_SECRET = "github-secret";
		delete process.env.PLUGIN_LINEAR_CLIENT_SECRET;

		expect(
			clientCredentials(
				method(["PLUGIN_LINEAR_CLIENT_ID", "PLUGIN_GITHUB_CLIENT_SECRET"]),
			),
		).toBeNull();
	});
});

describe("buildAuthorizationUrl", () => {
	beforeEach(() => {
		process.env.PLUGIN_LINEAR_CLIENT_ID = "id";
		process.env.PLUGIN_LINEAR_CLIENT_SECRET = "secret";
	});

	afterEach(() => {
		delete process.env.PLUGIN_LINEAR_CLIENT_ID;
		delete process.env.PLUGIN_LINEAR_CLIENT_SECRET;
	});

	const auth = {
		type: "oauth2" as const,
		authorization_url: "https://linear.app/oauth/authorize",
		scopes: ["read", "write"],
		scope_separator: ",",
		requires_env: ["PLUGIN_LINEAR_CLIENT_ID", "PLUGIN_LINEAR_CLIENT_SECRET"],
	};

	test("carries the client id, redirect, and state", () => {
		const url = new URL(
			buildAuthorizationUrl("linear", auth, { inputs: {} }, "state-token"),
		);

		expect(url.searchParams.get("client_id")).toBe("id");
		expect(url.searchParams.get("state")).toBe("state-token");
		expect(url.searchParams.get("response_type")).toBe("code");
		expect(url.searchParams.get("redirect_uri")).toBe(redirectUri("linear"));
	});

	test("joins scopes with the manifest's separator", () => {
		const url = new URL(
			buildAuthorizationUrl("linear", auth, { inputs: {} }, "s"),
		);
		expect(url.searchParams.get("scope")).toBe("read,write");
	});

	test("defaults the separator to a space", () => {
		const url = new URL(
			buildAuthorizationUrl(
				"linear",
				{ ...auth, scope_separator: undefined },
				{ inputs: {} },
				"s",
			),
		);
		expect(url.searchParams.get("scope")).toBe("read write");
	});

	test("refuses to build a URL for an unconfigured plugin", () => {
		delete process.env.PLUGIN_LINEAR_CLIENT_SECRET;
		expect(() =>
			buildAuthorizationUrl("linear", auth, { inputs: {} }, "s"),
		).toThrow(/No OAuth client configured/);
	});

	test("every plugin's callback sits under one registerable prefix", () => {
		expect(redirectUri("linear")).toBe(
			"https://api.test/api/plugins/callback/linear",
		);
	});
});
