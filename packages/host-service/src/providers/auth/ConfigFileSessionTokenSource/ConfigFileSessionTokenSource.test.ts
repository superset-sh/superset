import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigFileSessionTokenSource } from "./ConfigFileSessionTokenSource.ts";

let dir: string;
const realFetch = globalThis.fetch;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "superset-auth-config-"));
	globalThis.fetch = (async () =>
		new Response(
			JSON.stringify({
				access_token: "at_refreshed",
				refresh_token: "rt_refreshed",
				expires_in: 3600,
			}),
			{ headers: { "Content-Type": "application/json" } },
		)) as unknown as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = realFetch;
	rmSync(dir, { recursive: true, force: true });
});

function writeAuthConfig(path: string): void {
	writeFileSync(
		path,
		JSON.stringify({
			auth: {
				accessToken: "at_stale",
				refreshToken: "rt_stale",
				expiresAt: 0,
			},
		}),
		{ mode: 0o600 },
	);
}

describe("ConfigFileSessionTokenSource", () => {
	test("persists a refreshed token", async () => {
		const configPath = join(dir, "config.json");
		writeAuthConfig(configPath);
		const source = new ConfigFileSessionTokenSource({
			configPath,
			apiUrl: "https://api.test",
		});
		source.invalidateCache();

		expect(await source.getSessionToken()).toBe("at_refreshed");

		expect(JSON.parse(readFileSync(configPath, "utf-8")).auth.accessToken).toBe(
			"at_refreshed",
		);
	});

	test("writes through a symlinked config instead of replacing it", async () => {
		const dotfiles = join(dir, "dotfiles");
		const home = join(dir, "home");
		mkdirSync(dotfiles);
		mkdirSync(home);
		const real = join(dotfiles, "superset-auth.json");
		writeAuthConfig(real);
		const configPath = join(home, "config.json");
		symlinkSync(real, configPath);

		const source = new ConfigFileSessionTokenSource({
			configPath,
			apiUrl: "https://api.test",
		});
		source.invalidateCache();

		expect(await source.getSessionToken()).toBe("at_refreshed");

		expect(lstatSync(configPath).isSymbolicLink()).toBe(true);
		expect(JSON.parse(readFileSync(real, "utf-8")).auth).toEqual({
			accessToken: "at_refreshed",
			refreshToken: "rt_refreshed",
			expiresAt: expect.any(Number),
		});
	});
});
