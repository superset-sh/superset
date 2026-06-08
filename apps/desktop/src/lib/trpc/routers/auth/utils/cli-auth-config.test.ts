import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalSupersetHomeDir = process.env.SUPERSET_HOME_DIR;
const tempHome = join(tmpdir(), `superset-desktop-cli-auth-${randomUUID()}`);
process.env.SUPERSET_HOME_DIR = tempHome;

const { CLI_AUTH_CONFIG_PATH, clearCliAuthConfig, syncCliAuthConfig } =
	await import("./cli-auth-config");

afterAll(() => {
	rmSync(tempHome, { recursive: true, force: true });
	if (originalSupersetHomeDir === undefined) {
		delete process.env.SUPERSET_HOME_DIR;
	} else {
		process.env.SUPERSET_HOME_DIR = originalSupersetHomeDir;
	}
});

function readConfig(): Record<string, unknown> {
	return JSON.parse(readFileSync(CLI_AUTH_CONFIG_PATH, "utf-8")) as Record<
		string,
		unknown
	>;
}

describe("desktop CLI auth config sync", () => {
	test("writes desktop auth in the CLI-compatible config shape", async () => {
		await syncCliAuthConfig({
			token: "desktop-session-token",
			expiresAt: "2026-06-08T12:00:00.000Z",
			organizationId: "org-1",
		});

		expect(readConfig()).toEqual({
			auth: {
				accessToken: "desktop-session-token",
				expiresAt: Date.parse("2026-06-08T12:00:00.000Z"),
			},
			organizationId: "org-1",
		});
	});

	test("desktop auth supersedes stale API key config", async () => {
		mkdirSync(tempHome, { recursive: true });
		writeFileSync(
			CLI_AUTH_CONFIG_PATH,
			JSON.stringify({
				apiKey: "sk_live_old",
				organizationId: "org-old",
				otherSetting: true,
			}),
		);

		await syncCliAuthConfig({
			token: "desktop-session-token-2",
			expiresAt: "2026-06-08T13:00:00.000Z",
			organizationId: "org-2",
		});

		expect(readConfig()).toEqual({
			auth: {
				accessToken: "desktop-session-token-2",
				expiresAt: Date.parse("2026-06-08T13:00:00.000Z"),
			},
			organizationId: "org-2",
			otherSetting: true,
		});
	});

	test("clear removes desktop auth and active organization", async () => {
		await syncCliAuthConfig({
			token: "desktop-session-token-3",
			expiresAt: "2026-06-08T14:00:00.000Z",
			organizationId: "org-3",
		});

		await clearCliAuthConfig();

		expect(existsSync(CLI_AUTH_CONFIG_PATH)).toBe(true);
		expect(readConfig()).toEqual({ otherSetting: true });
	});
});
