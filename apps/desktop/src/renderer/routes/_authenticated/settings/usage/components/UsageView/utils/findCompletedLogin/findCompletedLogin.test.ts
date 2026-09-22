import { describe, expect, it } from "bun:test";
import type { UsageLogins } from "../../../../hooks/useHostUsageLogins";
import { findCompletedLogin } from "./findCompletedLogin";

const selection = "/home/test/.claude-work";
const empty: UsageLogins = {
	homeDir: "/home/test",
	claude: [],
	codex: [],
	claudeDefaultEmail: null,
	claudeDefaultFingerprint: null,
};
const profile = {
	configDir: selection,
	email: "person@example.com",
	credentialKind: "subscription" as const,
	fingerprint: "token-one",
};
const check = (
	current: UsageLogins,
	baseline = empty,
	commandSucceeded = false,
) =>
	findCompletedLogin({
		agent: "claude",
		credentialKind: "subscription",
		selection,
		current,
		baseline,
		commandSucceeded,
	});
describe("findCompletedLogin", () => {
	it("does not accept copied identity without credentials", () =>
		expect(
			check({ ...empty, claude: [{ ...profile, fingerprint: null }] }),
		).toBeNull());
	it("does not accept another profile signing in", () =>
		expect(
			check({
				...empty,
				claude: [{ ...profile, configDir: "/home/test/.claude-other" }],
			}),
		).toBeNull());
	it("accepts the selected profile after credentials appear", () =>
		expect(check({ ...empty, claude: [profile] })?.selection).toBe(selection));
	it("does not accept an unchanged existing login", () => {
		const snapshot = { ...empty, claude: [profile] };
		expect(check(snapshot, snapshot)).toBeNull();
	});
	it("detects re-login to the same email by credentials", () =>
		expect(
			check(
				{ ...empty, claude: [profile] },
				{ ...empty, claude: [{ ...profile, fingerprint: "old-token" }] },
			),
		).not.toBeNull());
	it("accepts a successfully completed CLI login with unchanged credentials", () => {
		const snapshot = { ...empty, claude: [profile] };
		expect(check(snapshot, snapshot, true)).not.toBeNull();
	});
	it("still requires credentials after CLI success", () =>
		expect(
			check(
				{ ...empty, claude: [{ ...profile, fingerprint: null }] },
				empty,
				true,
			),
		).toBeNull());
	it("does not confuse subscription and API billing", () =>
		expect(
			check({ ...empty, claude: [{ ...profile, credentialKind: "api_key" }] }),
		).toBeNull());
	it("requires the API marker before accepting API billing", () => {
		const input = {
			agent: "claude" as const,
			credentialKind: "api_key" as const,
			selection,
			baseline: empty,
			commandSucceeded: true,
		};
		expect(
			findCompletedLogin({
				...input,
				current: { ...empty, claude: [profile] },
			}),
		).toBeNull();
		expect(
			findCompletedLogin({
				...input,
				current: {
					...empty,
					claude: [
						{
							...profile,
							credentialKind: "api_key",
							fingerprint: "marker-mtime",
						},
					],
				},
			}),
		).not.toBeNull();
	});
	it("detects default Claude sign-in to the same email", () =>
		expect(
			findCompletedLogin({
				agent: "claude",
				credentialKind: "subscription",
				selection: null,
				baseline: {
					...empty,
					claudeDefaultEmail: "same@example.com",
					claudeDefaultFingerprint: "old",
				},
				current: {
					...empty,
					claudeDefaultEmail: "same@example.com",
					claudeDefaultFingerprint: "new",
				},
				commandSucceeded: false,
			}),
		).not.toBeNull());
	it("does not accept a Codex home without auth", () =>
		expect(
			findCompletedLogin({
				agent: "codex",
				credentialKind: "subscription",
				selection: "/home/test/.codex-work",
				baseline: empty,
				current: {
					...empty,
					codex: [
						{
							home: "/home/test/.codex-work",
							credentialKind: "subscription",
							fingerprint: null,
						},
					],
				},
				commandSucceeded: true,
			}),
		).toBeNull());
});
