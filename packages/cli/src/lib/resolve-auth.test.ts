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
const { readConfig, writeConfig, SUPERSET_HOME_DIR } = await import("./config");

// Manifest writes must use the config module's own SUPERSET_HOME_DIR rather
// than tempHome: other test files also set the env var at module top level,
// and if one of them gets collected during this file's top-level awaits, the
// const can capture that file's dir instead of tempHome. writeConfig and
// readManifest both go through the const, so deriving the manifest path from
// it keeps writer and reader consistent no matter which value won.
const manifestBaseDir = path.join(SUPERSET_HOME_DIR, "host");

function clearConfig(): void {
	writeConfig({});
}

// Clean baseline: the real dev/CI shell may export SUPERSET_API_KEY, which
// would leak into every test. Clear it for the suite, restore in afterAll.
const originalEnvKey = process.env.SUPERSET_API_KEY;
const originalOrganizationId = process.env.SUPERSET_ORGANIZATION_ID;
const originalTerminalId = process.env.SUPERSET_TERMINAL_ID;
const originalWorkspaceId = process.env.SUPERSET_WORKSPACE_ID;
delete process.env.SUPERSET_API_KEY;
delete process.env.SUPERSET_ORGANIZATION_ID;
delete process.env.SUPERSET_TERMINAL_ID;
delete process.env.SUPERSET_WORKSPACE_ID;

afterEach(() => {
	clearConfig();
	fs.rmSync(path.join(manifestBaseDir, "org_terminal"), {
		recursive: true,
		force: true,
	});
	delete process.env.SUPERSET_API_KEY;
	delete process.env.SUPERSET_ORGANIZATION_ID;
	delete process.env.SUPERSET_TERMINAL_ID;
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
	if (originalTerminalId === undefined) {
		delete process.env.SUPERSET_TERMINAL_ID;
	} else {
		process.env.SUPERSET_TERMINAL_ID = originalTerminalId;
	}
	if (originalWorkspaceId === undefined) {
		delete process.env.SUPERSET_WORKSPACE_ID;
	} else {
		process.env.SUPERSET_WORKSPACE_ID = originalWorkspaceId;
	}
});

async function withHostSessionServer<Result>(
	respond: (request: Request) => Response,
	run: (endpoint: string) => Promise<Result>,
): Promise<Result> {
	const server = Bun.serve({
		port: 0,
		hostname: "127.0.0.1",
		fetch: respond,
	});
	try {
		return await run(`http://127.0.0.1:${server.port}`);
	} finally {
		await server.stop(true);
	}
}

function writeHostManifest(organizationId: string, endpoint: string): void {
	const manifestDir = path.join(manifestBaseDir, organizationId);
	fs.mkdirSync(manifestDir, { recursive: true, mode: 0o700 });
	fs.writeFileSync(
		path.join(manifestDir, "manifest.json"),
		JSON.stringify({
			pid: process.pid,
			endpoint,
			authToken: "host-secret",
			startedAt: Date.now(),
			organizationId,
		}),
		{ mode: 0o600 },
	);
}

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

	it("uses the local host session in a Superset terminal before stale stored credentials", async () => {
		const organizationId = "org_terminal";
		process.env.SUPERSET_TERMINAL_ID = "term_1";
		process.env.SUPERSET_ORGANIZATION_ID = organizationId;
		writeConfig({
			auth: {
				accessToken: "stale-oauth-token",
				expiresAt: Date.now() - 1000,
			},
		});

		// Assertions on the request happen after the flow completes — an
		// expect() throw inside the handler would swallow the response and
		// surface as an unrelated timeout instead of the real mismatch.
		const seen: { pathname: string; authorization: string | null }[] = [];
		await withHostSessionServer(
			(request) => {
				seen.push({
					pathname: new URL(request.url).pathname,
					authorization: request.headers.get("authorization"),
				});
				return Response.json({
					token: "jwt-from-local-host",
					apiUrl: "https://api.desktop.test",
				});
			},
			async (endpoint) => {
				writeHostManifest(organizationId, endpoint);
				const result = await resolveAuth(undefined);
				expect(result.bearer).toBe("jwt-from-local-host");
				expect(result.authSource).toBe("host");
				expect(result.config.organizationId).toBe(organizationId);
			},
		);
		expect(seen).toEqual([
			{
				pathname: "/auth/session-jwt",
				authorization: "Bearer host-secret",
			},
		]);
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
