// biome-ignore-all lint/suspicious/noTemplateCurlyInString: ${config.*} is the manifest placeholder syntax, not a template literal
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { setTestEnv } from "../../../../test/env";
import type { InstalledPlugin } from "../connections";

// Every dependency that reaches the database is stubbed so the validated env
// and the connection it opens at import stay out of this test's module graph.
// `mock.module` is process-wide, so each stub lists every export the real
// module has: another file's import resolves against the stub too.

let install: InstalledPlugin | null = null;
let installedCalls: Array<[string, string, string | undefined]> = [];
let active: Record<string, unknown> | null = null;
let accounts: Record<string, unknown>[] | null = null;
let pinned: Record<string, unknown> | null = null;
let pinnedCalls: Array<[string, unknown]> = [];
let refreshError: Error | null = null;

class StubUnrefreshable extends Error {
	constructor(connector: string) {
		super(`The ${connector} connection expired and carries no refresh token.`);
		this.name = "UnrefreshableConnectionError";
	}
}

class StubUnavailable extends Error {
	constructor(
		readonly connector: string,
		detail: string,
	) {
		super(`The ${connector} token endpoint is unavailable: ${detail}`);
		this.name = "ConnectorUnavailableError";
	}
}

setTestEnv({ NEXT_PUBLIC_API_URL: "https://api.superset.test" });

mock.module("../connections", () => ({
	installedPlugin: (userId: string, plugin: string, marketplace?: string) => {
		installedCalls.push([userId, plugin, marketplace]);
		return Promise.resolve(install);
	},
	installRecord: () => Promise.resolve(null),
	installById: () => Promise.resolve(null),
	installedManifest: () => Promise.resolve(null),
	AmbiguousPluginError: class extends Error {},
}));

mock.module("../../../lib/connectors/lookup", () => ({
	connectionById: (id: string, options: unknown) => {
		pinnedCalls.push([id, options]);
		return Promise.resolve(pinned);
	},
	orgConnection: () => Promise.resolve(null),
	userConnection: () => Promise.resolve(null),
	userConnections: () => Promise.resolve(accounts ?? (active ? [active] : [])),
	accountConnection: () => Promise.resolve(null),
	accountConnections: () => Promise.resolve([]),
	connectorConnections: () => Promise.resolve([]),
	connectionBotToken: () => Promise.resolve(null),
	AmbiguousConnectionError: class extends Error {},
}));

mock.module("../../../lib/connectors/upsert", () => ({
	activeConnection: () => Promise.resolve(active),
	connectionSecrets: (row: { id: string }) =>
		Promise.resolve({
			accessToken: `token-for-${row.id}`,
			refreshToken: null,
			config: { bot_token: null },
		}),
	connectionConflict: () => Promise.resolve(null),
	upsertConnection: () => Promise.resolve(null),
}));

mock.module("../../../lib/connectors/refresh", () => ({
	ensureFreshConnection: (row: Record<string, unknown>) =>
		refreshError ? Promise.reject(refreshError) : Promise.resolve(row),
	connectionAccessToken: () => Promise.resolve("token"),
	markNeedsReauth: () => Promise.resolve(),
	NEEDS_REAUTH: "needs_reauth",
	ConnectorUnavailableError: StubUnavailable,
	UnrefreshableConnectionError: StubUnrefreshable,
}));

const { PluginTargetError, resolveTarget, targetKey } = await import(
	"./resolve-target"
);

interface ManifestOptions {
	name?: string;
	connector?: string;
	mcpUrl?: string;
	bindHeaders?: Record<string, string>;
}

function manifest({
	name = "acme",
	connector,
	mcpUrl,
	bindHeaders,
}: ManifestOptions) {
	const extension: Record<string, unknown> = {
		interface: { displayName: name },
	};
	if (connector) extension.connector = { slug: connector };
	if (mcpUrl) extension.mcp = { type: "streamable-http", url: mcpUrl };
	if (bindHeaders) extension.bind = { headers: bindHeaders };
	return {
		name,
		version: "1.2.3",
		description: `${name} plugin`,
		extensions: { superset: extension },
	};
}

function installed(
	marketplace: string,
	options: ManifestOptions,
): InstalledPlugin {
	return {
		id: "install-1",
		marketplace,
		manifest: manifest(options) as InstalledPlugin["manifest"],
		connector: options.connector,
	};
}

const request = {
	userId: "user-1",
	organizationId: "org-1",
	marketplace: "superset",
	plugin: "acme",
};

beforeEach(() => {
	install = null;
	active = null;
	accounts = null;
	pinned = null;
	refreshError = null;
	installedCalls = [];
	pinnedCalls = [];
});

describe("resolveTarget", () => {
	test("404s when the plugin is not installed", async () => {
		await expect(resolveTarget(request)).rejects.toThrow(PluginTargetError);
		await resolveTarget(request).then(
			() => expect.unreachable("should have thrown"),
			(error: PluginTargetError) => expect(error.status).toBe(404),
		);
		expect(installedCalls[0]).toEqual(["user-1", "acme", "superset"]);
	});

	test("404s when a connector-free plugin declares no mcp url", async () => {
		install = installed("superset", {});
		await resolveTarget(request).then(
			() => expect.unreachable("should have thrown"),
			(error: PluginTargetError) => {
				expect(error).toBeInstanceOf(PluginTargetError);
				expect(error.status).toBe(404);
				expect(error.message).toContain("exposes no tools");
			},
		);
	});

	test("serves a connector-free plugin from its mcp url, keyed by the install", async () => {
		install = installed("superset", { mcpUrl: "https://mcp.acme.test/mcp" });

		const target = await resolveTarget(request);

		expect(target).toMatchObject({
			kind: "remote",
			plugin: "acme",
			version: "1.2.3",
			url: "https://mcp.acme.test/mcp",
			connectionId: "install-1",
		});
	});

	test("asks for auth when the connector has no active connection", async () => {
		install = installed("superset", { connector: "acme-crm" });

		const target = await resolveTarget(request);

		expect(target).toMatchObject({
			kind: "needs-auth",
			connector: "acme-crm",
		});
		expect(target).toHaveProperty(
			"connectUrl",
			"https://api.superset.test/api/connectors/acme-crm/connect?method=oauth2&organizationId=org-1",
		);
	});

	test("asks for auth, with the reason, when the token cannot be refreshed", async () => {
		install = installed("superset", { connector: "acme-crm" });
		active = { id: "conn-1", authMethod: "oauth2" };
		refreshError = new StubUnrefreshable("acme-crm");

		const target = await resolveTarget(request);

		expect(target.kind).toBe("needs-auth");
		expect(target).toHaveProperty(
			"reason",
			expect.stringContaining("carries no refresh token"),
		);
	});

	test("rethrows a refresh failure that is not an expired credential", async () => {
		install = installed("superset", { connector: "acme-crm" });
		active = { id: "conn-1", authMethod: "oauth2" };
		refreshError = new Error("token endpoint is down");

		await expect(resolveTarget(request)).rejects.toThrow(
			"token endpoint is down",
		);
	});

	test("an unreachable token endpoint is a bad gateway, not a reconnect prompt", async () => {
		install = installed("superset", { connector: "acme-crm" });
		active = { id: "conn-1", authMethod: "oauth2" };
		refreshError = new StubUnavailable("acme-crm", "503 Service Unavailable");

		// needs-auth would tell the user to reconnect a connection that is fine.
		const error = await resolveTarget(request).catch((e) => e);
		expect(error).toBeInstanceOf(PluginTargetError);
		expect(error.status).toBe(502);
	});

	test("binds the connection's credential into the remote server's headers", async () => {
		install = installed("superset", {
			connector: "acme-crm",
			mcpUrl: "https://mcp.acme.test/mcp",
			bindHeaders: { Authorization: "Bearer ${config.access_token}" },
		});
		active = { id: "conn-1", authMethod: "oauth2" };

		const target = await resolveTarget(request);

		expect(target).toMatchObject({
			kind: "remote",
			url: "https://mcp.acme.test/mcp",
			headers: { Authorization: "Bearer token-for-conn-1" },
			connectionId: "conn-1",
		});
	});

	test("serves a first-party hosted plugin from its in-tree server", async () => {
		install = {
			id: "install-1",
			marketplace: "superset",
			manifest: manifest({
				name: "gmail",
				connector: "google",
			}) as InstalledPlugin["manifest"],
			connector: "google",
		};
		active = { id: "conn-1", authMethod: "oauth2" };

		const target = await resolveTarget({ ...request, plugin: "gmail" });

		expect(target).toMatchObject({ kind: "first-party", plugin: "gmail" });
		expect(target).toHaveProperty("secrets.accessToken", "token-for-conn-1");
	});

	test("refuses to hand a hosted server to a plugin from another marketplace", async () => {
		install = {
			id: "install-1",
			marketplace: "community",
			manifest: manifest({
				name: "gmail",
				connector: "google",
			}) as InstalledPlugin["manifest"],
			connector: "google",
		};
		active = { id: "conn-1", authMethod: "oauth2" };

		await resolveTarget({
			...request,
			marketplace: "community",
			plugin: "gmail",
		}).then(
			() => expect.unreachable("a foreign gmail must not get the real server"),
			(error: PluginTargetError) => {
				expect(error).toBeInstanceOf(PluginTargetError);
				expect(error.status).toBe(501);
			},
		);
	});

	test("ignores a pinned connection that belongs to another user", async () => {
		install = installed("superset", { connector: "acme-crm" });
		pinned = {
			id: "conn-2",
			connectedByUserId: "user-2",
			organizationId: "org-1",
		};

		const target = await resolveTarget({
			...request,
			connectionId: "conn-2",
		});

		expect(target.kind).toBe("needs-auth");
		expect(pinnedCalls[0]).toEqual(["conn-2", { connector: "acme-crm" }]);
	});

	test("ignores a pinned connection from another organization", async () => {
		install = installed("superset", { connector: "acme-crm" });
		pinned = {
			id: "conn-3",
			connectedByUserId: "user-1",
			organizationId: "org-2",
		};

		const target = await resolveTarget({ ...request, connectionId: "conn-3" });

		expect(target.kind).toBe("needs-auth");
	});

	test("uses a pinned connection the caller owns", async () => {
		install = installed("superset", {
			connector: "acme-crm",
			mcpUrl: "https://mcp.acme.test/mcp",
		});
		pinned = {
			id: "conn-4",
			connectedByUserId: "user-1",
			organizationId: "org-1",
			authMethod: "oauth2",
		};

		const target = await resolveTarget({ ...request, connectionId: "conn-4" });

		expect(target).toMatchObject({ kind: "remote", connectionId: "conn-4" });
	});

	test("501s when a connected plugin has neither an mcp url nor a hosted server", async () => {
		install = installed("superset", { connector: "acme-crm" });
		active = { id: "conn-1", authMethod: "oauth2" };

		await resolveTarget(request).then(
			() => expect.unreachable("should have thrown"),
			(error: PluginTargetError) => {
				expect(error.status).toBe(501);
			},
		);
	});
});

describe("resolveTarget with several accounts", () => {
	const twoAccounts = [
		{
			id: "conn-work",
			authMethod: "oauth2",
			externalUserLabel: "satya@superset.sh",
			externalAccountLabel: null,
		},
		{
			id: "conn-personal",
			authMethod: "oauth2",
			externalUserLabel: "satya.personal@gmail.com",
			externalAccountLabel: null,
		},
	];

	test("keeps an account that needs reconnecting, so naming it is not rerouted", async () => {
		install = installed("superset", {
			connector: "acme-crm",
			mcpUrl: "https://mcp.acme.test/mcp",
		});
		accounts = [
			twoAccounts[0],
			{
				...twoAccounts[1],
				disconnectedAt: new Date(),
				disconnectReason: "needs_reauth",
			},
			{
				id: "conn-gone",
				authMethod: "oauth2",
				disconnectedAt: new Date(),
				disconnectReason: "user_disconnected",
			},
		];

		const target = await resolveTarget(request);

		expect(target.kind).toBe("multi");
		if (target.kind !== "multi") return;
		expect(target.accounts.map((account) => account.connectionId)).toEqual([
			"conn-personal",
			"conn-work",
		]);
	});

	test("offers both when the caller has two live connections", async () => {
		install = installed("superset", {
			connector: "acme-crm",
			mcpUrl: "https://mcp.acme.test/mcp",
		});
		accounts = twoAccounts;

		const target = await resolveTarget(request);

		expect(target).toMatchObject({
			kind: "multi",
			connector: "acme-crm",
			connectorLabel: "acme-crm",
			accounts: [
				{
					connectionId: "conn-personal",
					userLabel: "satya.personal@gmail.com",
				},
				{ connectionId: "conn-work", userLabel: "satya@superset.sh" },
			],
		});
	});

	test("orders the accounts by id, not by when they were last touched", async () => {
		install = installed("superset", {
			connector: "acme-crm",
			mcpUrl: "https://mcp.acme.test/mcp",
		});
		accounts = [twoAccounts[1], twoAccounts[0]];

		const target = await resolveTarget(request);
		if (target.kind !== "multi") return expect.unreachable("expected multi");

		expect(target.accounts.map((a) => a.connectionId)).toEqual([
			"conn-personal",
			"conn-work",
		]);
	});

	test("one connection resolves exactly as it does today", async () => {
		install = installed("superset", {
			connector: "acme-crm",
			mcpUrl: "https://mcp.acme.test/mcp",
		});
		accounts = [twoAccounts[0]];

		const target = await resolveTarget(request);

		expect(target).toMatchObject({ kind: "remote", connectionId: "conn-work" });
	});

	test("a pinned connection skips the choice entirely", async () => {
		install = installed("superset", {
			connector: "acme-crm",
			mcpUrl: "https://mcp.acme.test/mcp",
		});
		accounts = twoAccounts;
		pinned = {
			id: "conn-personal",
			connectedByUserId: "user-1",
			organizationId: "org-1",
			authMethod: "oauth2",
		};

		const target = await resolveTarget({
			...request,
			connectionId: "conn-personal",
		});

		expect(target).toMatchObject({
			kind: "remote",
			connectionId: "conn-personal",
		});
	});

	test("resolve() turns one account into a single-account target", async () => {
		install = installed("superset", {
			connector: "acme-crm",
			mcpUrl: "https://mcp.acme.test/mcp",
		});
		accounts = twoAccounts;
		pinned = {
			id: "conn-work",
			connectedByUserId: "user-1",
			organizationId: "org-1",
			authMethod: "oauth2",
		};

		const target = await resolveTarget(request);
		if (target.kind !== "multi") return expect.unreachable("expected multi");
		const resolved = await target.resolve("conn-work");

		expect(resolved).toMatchObject({
			kind: "remote",
			connectionId: "conn-work",
		});
	});

	test("no connection at all still asks for auth", async () => {
		install = installed("superset", { connector: "acme-crm" });
		accounts = [];

		expect((await resolveTarget(request)).kind).toBe("needs-auth");
	});
});

describe("targetKey", () => {
	test("is the connection for a single-account target", () => {
		expect(
			targetKey({
				kind: "remote",
				plugin: "acme",
				version: "1.0.0",
				url: "https://mcp.acme.test/mcp",
				headers: {},
				connectionId: "conn-1",
			}),
		).toBe("conn-1");
	});

	test("is the whole account set, order-independent, for a multi target", () => {
		const base = {
			kind: "multi" as const,
			plugin: "acme",
			version: "1.0.0",
			connector: "acme-crm",
			connectorLabel: "acme-crm",
			resolve: () => expect.unreachable("not called"),
		};
		const forward = targetKey({
			...base,
			accounts: [{ connectionId: "a" }, { connectionId: "b" }],
		});
		const reverse = targetKey({
			...base,
			accounts: [{ connectionId: "b" }, { connectionId: "a" }],
		});

		expect(forward).toBe("a+b");
		expect(reverse).toBe(forward);
	});
});
