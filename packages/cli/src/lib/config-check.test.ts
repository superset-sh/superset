import { afterAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkConfig, checkConfigFile } from "./config-check";

const PATH = "/home/user/.superset/config.json";
const NOW = 1_000_000;

const check = (config: unknown) =>
	checkConfig(JSON.stringify(config), PATH, NOW);

describe("checkConfig", () => {
	it("reports a missing file as valid but not logged in, with no issues", () => {
		expect(checkConfig(undefined, PATH)).toEqual({
			path: PATH,
			exists: false,
			valid: true,
			loggedIn: false,
			issues: [],
		});
	});

	it("reports invalid JSON as a single error", () => {
		const result = checkConfig("{not json", PATH);
		expect(result.exists).toBe(true);
		expect(result.valid).toBe(false);
		expect(result.loggedIn).toBe(false);
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]?.severity).toBe("error");
		expect(result.issues[0]?.message).toStartWith("Invalid JSON: ");
	});

	it("rejects a non-object top level", () => {
		expect(check([1, 2, 3]).issues).toEqual([
			{ severity: "error", message: "Top-level value must be a JSON object" },
		]);
		expect(check([1, 2, 3]).valid).toBe(false);
	});

	it("accepts a valid, unexpired auth block without issues", () => {
		const result = check({
			auth: { accessToken: "tok", expiresAt: NOW + 3_600_000 },
			organizationId: "org-1",
		});
		expect(result).toEqual({
			path: PATH,
			exists: true,
			valid: true,
			loggedIn: true,
			issues: [],
		});
	});

	it("warns on an expired token, naming the refresh that will happen", () => {
		const result = check({
			auth: { accessToken: "tok", refreshToken: "r", expiresAt: NOW - 1 },
		});
		expect(result.valid).toBe(true);
		expect(result.loggedIn).toBe(true);
		expect(result.issues).toEqual([
			{
				severity: "warning",
				message:
					"`auth.expiresAt` is in the past: the next command refreshes the token",
			},
		]);
	});

	it("counts an expired token with no refresh token as logged out", () => {
		const result = check({ auth: { accessToken: "tok", expiresAt: NOW - 1 } });
		expect(result.valid).toBe(true);
		expect(result.loggedIn).toBe(false);
		expect(result.issues).toEqual([
			{
				severity: "warning",
				message:
					'`auth.expiresAt` is in the past and there is no refresh token: the next command fails with "Session expired" (run: superset auth login)',
			},
		]);
	});

	it("treats a token inside the refresh leeway as due, like resolveAuth does", () => {
		const result = check({
			auth: { accessToken: "tok", refreshToken: "r", expiresAt: NOW + 60_000 },
		});
		expect(result.loggedIn).toBe(true);
		expect(result.issues).toEqual([
			{
				severity: "warning",
				message:
					"`auth.expiresAt` is less than 5 minutes away: the next command refreshes the token",
			},
		]);
	});

	it("errors on auth without an access token, and is then not logged in", () => {
		const result = check({ auth: { expiresAt: 1 } });
		expect(result.valid).toBe(false);
		expect(result.loggedIn).toBe(false);
		expect(result.issues.map((i) => i.message)).toContain(
			"`auth.accessToken` must be a non-empty string",
		);
	});

	it("errors on auth fields of the wrong type", () => {
		const result = check({
			auth: { accessToken: "tok", refreshToken: 7, expiresAt: "soon" },
		});
		expect(result.valid).toBe(false);
		expect(result.issues.map((i) => i.message)).toEqual([
			"`auth.refreshToken` must be a non-empty string",
			"`auth.expiresAt` must be a finite number (ms since the epoch)",
		]);
	});

	it("rejects a non-finite expiresAt, which JSON can spell as 1e400", () => {
		const result = checkConfig(
			'{"auth":{"accessToken":"tok","expiresAt":1e400}}',
			PATH,
			NOW,
		);
		expect(result.valid).toBe(false);
		expect(result.issues.map((i) => i.message)).toEqual([
			"`auth.expiresAt` must be a finite number (ms since the epoch)",
		]);
	});

	it("warns on unknown keys inside auth, where a typo loses the refresh token", () => {
		const result = check({
			auth: {
				accessToken: "tok",
				refeshToken: "r",
				expiresAt: NOW + 3_600_000,
			},
		});
		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([
			{
				severity: "warning",
				message: 'Unknown key "auth.refeshToken" (this CLI version ignores it)',
			},
		]);
	});

	it("rejects whitespace-only credentials, which resolveAuth trims to nothing", () => {
		expect(check({ apiKey: "   " }).valid).toBe(false);
		expect(check({ apiKey: "   " }).loggedIn).toBe(false);
		const auth = check({
			auth: { accessToken: " ", expiresAt: NOW + 3_600_000 },
		});
		expect(auth.valid).toBe(false);
	});

	it("errors on auth that is not an object", () => {
		expect(check({ auth: "tok" }).issues[0]).toEqual({
			severity: "error",
			message: "`auth` must be an object",
		});
	});

	it("accepts an apiKey with the expected prefix", () => {
		const result = check({ apiKey: "sk_live_abc123" });
		expect(result.valid).toBe(true);
		expect(result.loggedIn).toBe(true);
		expect(result.issues).toEqual([]);
	});

	it("warns on an apiKey without the expected prefix", () => {
		const result = check({ apiKey: "abc123" });
		expect(result.valid).toBe(true);
		expect(result.loggedIn).toBe(true);
		expect(result.issues).toEqual([
			{
				severity: "warning",
				message:
					"`apiKey` does not look like a Superset API key (expected an sk_ prefix)",
			},
		]);
	});

	it("errors on an empty apiKey", () => {
		const result = check({ apiKey: "" });
		expect(result.valid).toBe(false);
		expect(result.loggedIn).toBe(false);
	});

	it("errors on a non-string organizationId", () => {
		const result = check({ apiKey: "sk_x", organizationId: 12 });
		expect(result.valid).toBe(false);
		expect(result.issues).toEqual([
			{
				severity: "error",
				message: "`organizationId` must be a non-empty string",
			},
		]);
	});

	it("warns on unknown top-level keys instead of erroring", () => {
		const result = check({ apiKey: "sk_x", futureField: true });
		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([
			{
				severity: "warning",
				message: 'Unknown key "futureField" (this CLI version ignores it)',
			},
		]);
	});

	it("does not treat inherited object keys as known", () => {
		const result = check({ apiKey: "sk_x", constructor: 1, toString: 2 });
		expect(result.valid).toBe(true);
		expect(result.issues.map((i) => i.message)).toEqual([
			'Unknown key "constructor" (this CLI version ignores it)',
			'Unknown key "toString" (this CLI version ignores it)',
		]);
	});

	it("warns not-logged-in on a valid but empty object", () => {
		const result = check({});
		expect(result.valid).toBe(true);
		expect(result.loggedIn).toBe(false);
		expect(result.issues).toEqual([
			{
				severity: "warning",
				message:
					"No `auth` or `apiKey`: this file holds no login (run: superset auth login)",
			},
		]);
	});

	it("is logged in when apiKey and auth are both present and valid", () => {
		const result = check({
			apiKey: "sk_live_x",
			auth: { accessToken: "tok", expiresAt: NOW + 3_600_000 },
		});
		expect(result.loggedIn).toBe(true);
		expect(result.valid).toBe(true);
	});
});

describe("checkConfigFile", () => {
	const dir = mkdtempSync(join(tmpdir(), "superset-config-check-"));
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	it("treats a missing file as not existing", () => {
		const path = join(dir, "missing.json");
		expect(checkConfigFile(path)).toEqual({
			path,
			exists: false,
			valid: true,
			loggedIn: false,
			issues: [],
		});
	});

	it("checks the file's contents", () => {
		const path = join(dir, "config.json");
		writeFileSync(path, JSON.stringify({ apiKey: "sk_live_x" }));
		const result = checkConfigFile(path);
		expect(result.exists).toBe(true);
		expect(result.valid).toBe(true);
		expect(result.loggedIn).toBe(true);
	});

	it("reports a file it cannot read as an error rather than throwing", () => {
		const path = join(dir, "a-directory");
		mkdirSync(path);
		const result = checkConfigFile(path);
		expect(result.exists).toBe(true);
		expect(result.valid).toBe(false);
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]?.severity).toBe("error");
		expect(result.issues[0]?.message).toStartWith("Could not read the file: ");
	});
});
