import { afterAll, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempHomes: string[] = [];

type ScenarioResult = Record<string, unknown>;

function runScenario(source: string): ScenarioResult {
	const tempHome = fs.mkdtempSync(
		path.join(os.tmpdir(), "superset-cli-resolve-auth-"),
	);
	tempHomes.push(tempHome);

	const result = spawnSync(process.execPath, ["--eval", source], {
		cwd: process.cwd(),
		env: {
			...process.env,
			SUPERSET_HOME_DIR: tempHome,
			SUPERSET_API_URL: "https://api.example.com",
		},
		encoding: "utf-8",
		maxBuffer: 1024 * 1024,
	});

	if (result.status !== 0) {
		throw new Error(
			[
				`scenario failed with exit ${result.status}`,
				"--- stdout ---",
				result.stdout,
				"--- stderr ---",
				result.stderr,
			].join("\n"),
		);
	}

	const output = result.stdout.trim().split("\n").at(-1);
	if (!output) {
		throw new Error("scenario produced no JSON output");
	}
	return JSON.parse(output) as ScenarioResult;
}

function scenario(body: string): ScenarioResult {
	return runScenario(`
		const { resolveAuth } = await import("./src/lib/resolve-auth.ts");
		const { readConfig, writeConfig } = await import("./src/lib/config.ts");
		const { writeManifest } = await import("./src/lib/host/manifest.ts");

		${body}
	`);
}

afterAll(() => {
	for (const tempHome of tempHomes) {
		fs.rmSync(tempHome, { recursive: true, force: true });
	}
});

describe("resolveAuth", () => {
	it("throws when no override and no stored credentials", () => {
		const result = scenario(`
			try {
				await resolveAuth(undefined);
				console.log(JSON.stringify({ ok: true }));
			} catch (error) {
				console.log(JSON.stringify({
					ok: false,
					message: error instanceof Error ? error.message : String(error),
				}));
			}
		`);

		expect(result.ok).toBe(false);
		expect(result.message).toMatch(/Not logged in/);
	});

	it("uses an override api key with 'override' source", () => {
		const result = scenario(`
			const resolved = await resolveAuth("sk_live_override");
			console.log(JSON.stringify({
				bearer: resolved.bearer,
				authSource: resolved.authSource,
			}));
		`);

		expect(result.bearer).toBe("sk_live_override");
		expect(result.authSource).toBe("override");
	});

	it("uses a stored apiKey from config with 'config' source", () => {
		const result = scenario(`
			writeConfig({ apiKey: "sk_live_stored", organizationId: "org_1" });
			const resolved = await resolveAuth(undefined);
			console.log(JSON.stringify({
				bearer: resolved.bearer,
				authSource: resolved.authSource,
				organizationId: resolved.config.organizationId,
			}));
		`);

		expect(result.bearer).toBe("sk_live_stored");
		expect(result.authSource).toBe("config");
		expect(result.organizationId).toBe("org_1");
	});

	it("uses a stored OAuth session when present and unexpired", () => {
		const result = scenario(`
			writeConfig({
				auth: {
					accessToken: "oauth-token",
					refreshToken: "oauth-refresh",
					expiresAt: Date.now() + 60 * 60 * 1000,
				},
			});
			const resolved = await resolveAuth(undefined);
			console.log(JSON.stringify({
				bearer: resolved.bearer,
				authSource: resolved.authSource,
			}));
		`);

		expect(result.bearer).toBe("oauth-token");
		expect(result.authSource).toBe("oauth");
	});

	it("defers OAuth refresh to the host while the host process is alive", () => {
		const result = scenario(`
			let refreshCalls = 0;
			globalThis.fetch = async () => {
				refreshCalls += 1;
				throw new Error("refresh should be deferred to the host");
			};
			writeConfig({
				organizationId: "org_1",
				auth: {
					accessToken: "near-expiry-access-token",
					refreshToken: "refresh-token",
					expiresAt: Date.now() + 60_000,
				},
			});
			writeManifest({
				pid: process.pid,
				endpoint: "http://127.0.0.1:4879",
				authToken: "host-secret",
				startedAt: Date.now(),
				organizationId: "org_1",
			});
			const resolved = await resolveAuth(undefined);
			console.log(JSON.stringify({
				bearer: resolved.bearer,
				authSource: resolved.authSource,
				refreshCalls,
				config: readConfig(),
			}));
		`);

		expect(result.bearer).toBe("near-expiry-access-token");
		expect(result.authSource).toBe("oauth");
		expect(result.refreshCalls).toBe(0);
		expect(result.config).toMatchObject({
			auth: { accessToken: "near-expiry-access-token" },
		});
	});

	it("refreshes OAuth credentials when the host manifest process is not alive", () => {
		const result = scenario(`
			let refreshCalls = 0;
			globalThis.fetch = async () => {
				refreshCalls += 1;
				return new Response(JSON.stringify({
					access_token: "refreshed-access-token",
					token_type: "Bearer",
					expires_in: 3600,
					refresh_token: "rotated-refresh-token",
				}), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			};
			writeConfig({
				organizationId: "org_1",
				auth: {
					accessToken: "near-expiry-access-token",
					refreshToken: "refresh-token",
					expiresAt: Date.now() + 60_000,
				},
			});
			writeManifest({
				pid: 99999999,
				endpoint: "http://127.0.0.1:4879",
				authToken: "host-secret",
				startedAt: Date.now(),
				organizationId: "org_1",
			});
			const resolved = await resolveAuth(undefined);
			console.log(JSON.stringify({
				bearer: resolved.bearer,
				authSource: resolved.authSource,
				refreshCalls,
				config: readConfig(),
			}));
		`);

		expect(result.bearer).toBe("refreshed-access-token");
		expect(result.authSource).toBe("oauth");
		expect(result.refreshCalls).toBe(1);
		expect(result.config).toMatchObject({
			auth: {
				accessToken: "refreshed-access-token",
				refreshToken: "rotated-refresh-token",
			},
		});
	});

	it("refreshes OAuth credentials when no host manifest exists", () => {
		const result = scenario(`
			let refreshCalls = 0;
			globalThis.fetch = async () => {
				refreshCalls += 1;
				return new Response(JSON.stringify({
					access_token: "refreshed-access-token",
					token_type: "Bearer",
					expires_in: 3600,
					refresh_token: "rotated-refresh-token",
				}), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			};
			writeConfig({
				organizationId: "org_1",
				auth: {
					accessToken: "near-expiry-access-token",
					refreshToken: "refresh-token",
					expiresAt: Date.now() + 60_000,
				},
			});
			const resolved = await resolveAuth(undefined);
			console.log(JSON.stringify({
				bearer: resolved.bearer,
				authSource: resolved.authSource,
				refreshCalls,
				config: readConfig(),
			}));
		`);

		expect(result.bearer).toBe("refreshed-access-token");
		expect(result.authSource).toBe("oauth");
		expect(result.refreshCalls).toBe(1);
	});

	it("throws when OAuth session is expired and there is no refresh token", () => {
		const result = scenario(`
			writeConfig({
				auth: { accessToken: "stale", expiresAt: Date.now() - 1000 },
			});
			try {
				await resolveAuth(undefined);
				console.log(JSON.stringify({ ok: true }));
			} catch (error) {
				console.log(JSON.stringify({
					ok: false,
					message: error instanceof Error ? error.message : String(error),
				}));
			}
		`);

		expect(result.ok).toBe(false);
		expect(result.message).toMatch(/Session expired/);
	});

	it("prefers an override over a stored apiKey", () => {
		const result = scenario(`
			writeConfig({ apiKey: "sk_live_stored" });
			const resolved = await resolveAuth("sk_live_override");
			console.log(JSON.stringify({
				bearer: resolved.bearer,
				authSource: resolved.authSource,
			}));
		`);

		expect(result.bearer).toBe("sk_live_override");
		expect(result.authSource).toBe("override");
	});

	it("prefers a stored apiKey over a stored OAuth session", () => {
		const result = scenario(`
			writeConfig({
				apiKey: "sk_live_stored",
				auth: {
					accessToken: "oauth-token",
					expiresAt: Date.now() + 60 * 60 * 1000,
				},
			});
			const resolved = await resolveAuth(undefined);
			console.log(JSON.stringify({
				bearer: resolved.bearer,
				authSource: resolved.authSource,
			}));
		`);

		expect(result.bearer).toBe("sk_live_stored");
		expect(result.authSource).toBe("config");
	});
});
