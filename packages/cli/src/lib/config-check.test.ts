import { describe, expect, it } from "bun:test";
import { checkConfig } from "./config-check";

const PATH = "/home/user/.superset/config.json";

describe("checkConfig", () => {
	it("reports a missing file as valid but not logged in, with no issues", () => {
		const result = checkConfig(undefined, PATH);
		expect(result).toEqual({
			path: PATH,
			exists: false,
			valid: true,
			loggedIn: false,
			issues: [],
		});
	});

	it("reports invalid JSON as a single error, not logged in", () => {
		const result = checkConfig("{not json", PATH);
		expect(result.exists).toBe(true);
		expect(result.valid).toBe(false);
		expect(result.loggedIn).toBe(false);
		expect(result.issues).toHaveLength(1);
		expect(result.issues[0]?.severity).toBe("error");
		expect(result.issues[0]?.message).toContain("Invalid JSON");
	});

	it("rejects a non-object top level", () => {
		const result = checkConfig("[1,2,3]", PATH);
		expect(result.valid).toBe(false);
		expect(result.issues).toEqual([
			{ severity: "error", message: "Top-level value must be a JSON object" },
		]);
	});

	it("accepts a valid, unexpired auth block with no issues beyond none", () => {
		const now = 1_000_000;
		const result = checkConfig(
			JSON.stringify({
				auth: { accessToken: "tok", expiresAt: now + 60_000 },
				organizationId: "org-1",
			}),
			PATH,
			now,
		);
		expect(result.valid).toBe(true);
		expect(result.loggedIn).toBe(true);
		expect(result.issues).toEqual([]);
	});

	it("warns (but does not error) on an expired access token", () => {
		const now = 1_000_000;
		const result = checkConfig(
			JSON.stringify({ auth: { accessToken: "tok", expiresAt: now - 1 } }),
			PATH,
			now,
		);
		expect(result.valid).toBe(true);
		expect(result.loggedIn).toBe(true);
		expect(result.issues).toEqual([
			{
				severity: "warning",
				message:
					"`auth.expiresAt` is in the past — the access token is expired (refreshes automatically if a refresh token is present)",
			},
		]);
	});

	it("errors on auth missing accessToken", () => {
		const result = checkConfig(
			JSON.stringify({ auth: { expiresAt: 1 } }),
			PATH,
		);
		expect(result.valid).toBe(false);
		expect(result.loggedIn).toBe(false);
		expect(
			result.issues.some((i) => i.message.includes("auth.accessToken")),
		).toBe(true);
	});

	it("errors on auth.expiresAt of the wrong type", () => {
		const result = checkConfig(
			JSON.stringify({ auth: { accessToken: "tok", expiresAt: "soon" } }),
			PATH,
		);
		expect(result.valid).toBe(false);
		expect(
			result.issues.some((i) => i.message.includes("auth.expiresAt")),
		).toBe(true);
	});

	it("accepts a valid apiKey with the expected prefix", () => {
		const result = checkConfig(
			JSON.stringify({ apiKey: "sk_live_abc123" }),
			PATH,
		);
		expect(result.valid).toBe(true);
		expect(result.loggedIn).toBe(true);
		expect(result.issues).toEqual([]);
	});

	it("warns on an apiKey without the expected prefix", () => {
		const result = checkConfig(JSON.stringify({ apiKey: "abc123" }), PATH);
		expect(result.valid).toBe(true);
		expect(result.loggedIn).toBe(true);
		expect(result.issues).toEqual([
			{
				severity: "warning",
				message:
					"`apiKey` doesn't look like a Superset API key (expected an sk_... prefix)",
			},
		]);
	});

	it("errors on an empty apiKey", () => {
		const result = checkConfig(JSON.stringify({ apiKey: "" }), PATH);
		expect(result.valid).toBe(false);
		expect(result.loggedIn).toBe(false);
	});

	it("errors on a non-string organizationId", () => {
		const result = checkConfig(
			JSON.stringify({ apiKey: "sk_x", organizationId: 12 }),
			PATH,
		);
		expect(result.valid).toBe(false);
	});

	it("warns on unknown top-level keys instead of erroring", () => {
		const result = checkConfig(
			JSON.stringify({ apiKey: "sk_x", futureField: true }),
			PATH,
		);
		expect(result.valid).toBe(true);
		expect(result.issues).toEqual([
			{
				severity: "warning",
				message:
					'Unknown key "futureField" — not read by any current Superset CLI version',
			},
		]);
	});

	it("warns not-logged-in when the file is a valid but empty object", () => {
		const result = checkConfig("{}", PATH);
		expect(result.valid).toBe(true);
		expect(result.loggedIn).toBe(false);
		expect(result.issues).toEqual([
			{
				severity: "warning",
				message:
					"No `auth` or `apiKey` present — not logged in (run: superset auth login)",
			},
		]);
	});

	it("treats apiKey and auth both present as logged in, validating both", () => {
		const now = 1_000_000;
		const result = checkConfig(
			JSON.stringify({
				apiKey: "sk_live_x",
				auth: { accessToken: "tok", expiresAt: now + 1000 },
			}),
			PATH,
			now,
		);
		expect(result.loggedIn).toBe(true);
		expect(result.valid).toBe(true);
	});
});
