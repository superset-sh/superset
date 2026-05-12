import { afterAll, afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempHome = fs.mkdtempSync(
	path.join(os.tmpdir(), "superset-cli-resolve-auth-"),
);
process.env.SUPERSET_HOME_DIR = tempHome;

const { resolveAuth } = await import("./resolve-auth");
const { writeConfig } = await import("./config");

const originalArgv = process.argv;

function setArgv(args: string[]): void {
	process.argv = ["bun", "superset", ...args];
}

function clearConfig(): void {
	writeConfig({});
}

afterEach(() => {
	process.argv = originalArgv;
	clearConfig();
});

afterAll(() => {
	fs.rmSync(tempHome, { recursive: true, force: true });
});

describe("resolveAuth", () => {
	it("throws when no override and no stored credentials", async () => {
		setArgv(["status"]);
		await expect(resolveAuth(undefined)).rejects.toThrow(/Not logged in/);
	});

	it("uses an explicit --api-key flag with 'flag' source", async () => {
		setArgv(["status", "--api-key", "sk_live_flag"]);
		const result = await resolveAuth("sk_live_flag");
		expect(result.bearer).toBe("sk_live_flag");
		expect(result.authSource).toBe("flag");
	});

	it("uses an env-supplied api key with 'env' source", async () => {
		setArgv(["status"]);
		const result = await resolveAuth("sk_live_envvar");
		expect(result.bearer).toBe("sk_live_envvar");
		expect(result.authSource).toBe("env");
	});

	it("uses a stored apiKey from config with 'config' source", async () => {
		setArgv(["status"]);
		writeConfig({ apiKey: "sk_live_stored", organizationId: "org_1" });
		const result = await resolveAuth(undefined);
		expect(result.bearer).toBe("sk_live_stored");
		expect(result.authSource).toBe("config");
		expect(result.config.organizationId).toBe("org_1");
	});

	it("uses a stored OAuth session when present and unexpired", async () => {
		setArgv(["status"]);
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
		setArgv(["status"]);
		writeConfig({
			auth: { accessToken: "stale", expiresAt: Date.now() - 1000 },
		});
		await expect(resolveAuth(undefined)).rejects.toThrow(/Session expired/);
	});

	it("prefers an explicit override over a stored apiKey", async () => {
		setArgv(["status", "--api-key", "sk_live_flag"]);
		writeConfig({ apiKey: "sk_live_stored" });
		const result = await resolveAuth("sk_live_flag");
		expect(result.bearer).toBe("sk_live_flag");
		expect(result.authSource).toBe("flag");
	});

	it("prefers a stored apiKey over a stored OAuth session", async () => {
		setArgv(["status"]);
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

	it("treats --api-key=value form as flag, not env", async () => {
		setArgv(["status", "--api-key=sk_live_eq"]);
		const result = await resolveAuth("sk_live_eq");
		expect(result.authSource).toBe("flag");
	});
});
