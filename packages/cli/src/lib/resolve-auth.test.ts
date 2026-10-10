import { afterAll, afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const tempHome = fs.mkdtempSync(
	path.join(os.tmpdir(), "superset-cli-resolve-auth-"),
);
process.env.SUPERSET_HOME_DIR = tempHome;

const { resolveAuth } = await import("./resolve-auth");
const { readConfig, writeConfig } = await import("./config");
const { removeManifest, writeManifest } = await import("./host/manifest");

function clearConfig(): void {
	writeConfig({});
}

// Clean baseline: the real dev/CI shell may export SUPERSET_API_KEY, which
// would leak into every test. Clear it for the suite, restore in afterAll.
const originalEnvKey = process.env.SUPERSET_API_KEY;
const originalOrganizationId = process.env.SUPERSET_ORGANIZATION_ID;
const originalWorkspaceId = process.env.SUPERSET_WORKSPACE_ID;
const originalSandboxWorkspaceId = process.env.SUPERSET_SANDBOX_WORKSPACE_ID;
delete process.env.SUPERSET_API_KEY;
delete process.env.SUPERSET_ORGANIZATION_ID;
delete process.env.SUPERSET_WORKSPACE_ID;
delete process.env.SUPERSET_SANDBOX_WORKSPACE_ID;

afterEach(() => {
	clearConfig();
	delete process.env.SUPERSET_API_KEY;
	delete process.env.SUPERSET_ORGANIZATION_ID;
	delete process.env.SUPERSET_WORKSPACE_ID;
});

afterAll(() => {
	fs.rmSync(tempHome, { recursive: true, force: true });
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
	if (originalEnvKey === undefined) delete process.env.SUPERSET_API_KEY;
	else process.env.SUPERSET_API_KEY = originalEnvKey;
	if (originalOrganizationId === undefined) {
		delete process.env.SUPERSET_ORGANIZATION_ID;
	} else {
		process.env.SUPERSET_ORGANIZATION_ID = originalOrganizationId;
	}
	if (originalWorkspaceId === undefined) {
		delete process.env.SUPERSET_WORKSPACE_ID;
	} else {
		process.env.SUPERSET_WORKSPACE_ID = originalWorkspaceId;
	}
	if (originalSandboxWorkspaceId !== undefined) {
		process.env.SUPERSET_SANDBOX_WORKSPACE_ID = originalSandboxWorkspaceId;
	}
});

describe("resolveAuth", () => {
	it("throws when no override and no stored credentials", async () => {
		await expect(resolveAuth(undefined)).rejects.toThrow(/Not logged in/);
	});

	it("uses an override api key with 'override' source", async () => {
		const result = await resolveAuth("sk_live_override");
		expect(result.bearer).toBe("sk_live_override");
		expect(result.authSource).toBe("override");
	});

	it("uses a stored apiKey from config with 'config' source", async () => {
		writeConfig({ apiKey: "sk_live_stored", organizationId: "org_1" });
		const result = await resolveAuth(undefined);
		expect(result.bearer).toBe("sk_live_stored");
		expect(result.authSource).toBe("config");
		expect(result.config.organizationId).toBe("org_1");
	});

	it("uses a stored OAuth session when present and unexpired", async () => {
		const future = Date.now() + 60 * 60 * 1000;
		writeConfig({
			auth: {
				accessToken: "oauth-token",
				refreshToken: "oauth-refresh",
				expiresAt: future,
			},
		});
		const result = await resolveAuth(undefined);
		expect(result.bearer).toBe("oauth-token");
		expect(result.authSource).toBe("oauth");
	});

	it("throws when OAuth session is expired and there is no refresh token", async () => {
		writeConfig({
			auth: { accessToken: "stale", expiresAt: Date.now() - 1000 },
		});
		await expect(resolveAuth(undefined)).rejects.toThrow(/Session expired/);
	});

	it("prefers an override over a stored apiKey", async () => {
		writeConfig({ apiKey: "sk_live_stored" });
		const result = await resolveAuth("sk_live_override");
		expect(result.bearer).toBe("sk_live_override");
		expect(result.authSource).toBe("override");
	});

	it("uses SUPERSET_API_KEY env as an override when no flag is passed", async () => {
		process.env.SUPERSET_API_KEY = "sk_live_env";
		const result = await resolveAuth(undefined);
		expect(result.bearer).toBe("sk_live_env");
		expect(result.authSource).toBe("override");
	});

	it("prefers the --api-key flag over SUPERSET_API_KEY env", async () => {
		process.env.SUPERSET_API_KEY = "sk_live_env";
		const result = await resolveAuth("sk_live_flag");
		expect(result.bearer).toBe("sk_live_flag");
		expect(result.authSource).toBe("override");
	});

	it("prefers SUPERSET_API_KEY env over a stored apiKey and OAuth", async () => {
		writeConfig({
			apiKey: "sk_live_stored",
			auth: {
				accessToken: "oauth-token",
				expiresAt: Date.now() + 60 * 60 * 1000,
			},
		});
		process.env.SUPERSET_API_KEY = "sk_live_env";
		const result = await resolveAuth(undefined);
		expect(result.bearer).toBe("sk_live_env");
		expect(result.authSource).toBe("override");
	});

	it("overrides the stored org with SUPERSET_ORGANIZATION_ID", async () => {
		writeConfig({ apiKey: "sk_live_stored", organizationId: "org_stored" });
		process.env.SUPERSET_ORGANIZATION_ID = "org_env";
		const result = await resolveAuth(undefined);
		expect(result.config.organizationId).toBe("org_env");
		// Invocation-scoped only: the stored config on disk keeps the user's org.
		expect(readConfig().organizationId).toBe("org_stored");
	});

	it("keeps the stored org when SUPERSET_ORGANIZATION_ID is unset", async () => {
		writeConfig({ apiKey: "sk_live_stored", organizationId: "org_stored" });
		const result = await resolveAuth(undefined);
		expect(result.config.organizationId).toBe("org_stored");
	});

	it("prefers a stored apiKey over a stored OAuth session", async () => {
		writeConfig({
			apiKey: "sk_live_stored",
			auth: {
				accessToken: "oauth-token",
				expiresAt: Date.now() + 60 * 60 * 1000,
			},
		});
		const result = await resolveAuth(undefined);
		expect(result.bearer).toBe("sk_live_stored");
		expect(result.authSource).toBe("config");
	});
});

describe("resolveAuth in a Superset terminal", () => {
	let hostResponse: () => Response;
	const host = Bun.serve({ port: 0, fetch: () => hostResponse() });

	function enterTerminal(): void {
		process.env.SUPERSET_ORGANIZATION_ID = "org_workspace";
		process.env.SUPERSET_WORKSPACE_ID = "ws_1";
		writeManifest({
			pid: process.pid,
			endpoint: `http://127.0.0.1:${host.port}`,
			authToken: "host-secret",
			startedAt: Date.now(),
			organizationId: "org_workspace",
		});
	}

	afterEach(() => removeManifest("org_workspace"));
	afterAll(() => host.stop(true));

	it("acts as the account that runs the workspace's host", async () => {
		enterTerminal();
		writeConfig({ apiKey: "sk_live_other_account" });
		hostResponse = () =>
			Response.json([{ result: { data: { json: { token: "host-jwt" } } } }]);

		const result = await resolveAuth(undefined);

		expect(result.bearer).toBe("host-jwt");
		expect(result.authSource).toBe("host");
		expect(result.config.organizationId).toBe("org_workspace");
	});

	it("falls back to its own login when the host gives no token", async () => {
		enterTerminal();
		writeConfig({ apiKey: "sk_live_own" });
		hostResponse = () =>
			Response.json(
				[
					{
						error: {
							json: {
								message: "No procedure",
								code: -32004,
								data: { code: "NOT_FOUND", httpStatus: 404 },
							},
						},
					},
				],
				{ status: 404 },
			);

		const result = await resolveAuth(undefined);

		expect(result.bearer).toBe("sk_live_own");
		expect(result.authSource).toBe("config");
	});

	it("keeps its own login for a command that outlives the host token", async () => {
		enterTerminal();
		writeConfig({ apiKey: "sk_live_own" });
		hostResponse = () =>
			Response.json([{ result: { data: { json: { token: "host-jwt" } } } }]);

		const result = await resolveAuth(undefined, { useHostToken: false });

		expect(result.bearer).toBe("sk_live_own");
	});
});
