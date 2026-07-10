import { afterEach, describe, expect, it } from "bun:test";
import {
	matchOrganization,
	type OrgChoice,
	resolveOrganization,
} from "./resolve-org";

const orgA: OrgChoice = { id: "org-a-uuid", name: "Acme", slug: "acme" };
const orgB: OrgChoice = { id: "org-b-uuid", name: "Beta Co", slug: "beta" };

// Env vars that make isAgentMode() true (mirrors cli-framework's list). Cleared
// so a test can exercise the pure-TTY branch deterministically.
const AGENT_ENV_VARS = [
	"CLAUDE_CODE",
	"CLAUDECODE",
	"CLAUDE_CODE_ENTRYPOINT",
	"CODEX_CLI",
	"GEMINI_CLI",
	"SUPERSET_AGENT",
	"CI",
];

const originalIsTTY = process.stdout.isTTY;
const originalAgentEnv = new Map(
	AGENT_ENV_VARS.map((v) => [v, process.env[v]]),
);

afterEach(() => {
	setTTY(originalIsTTY);
	for (const [v, val] of originalAgentEnv) {
		if (val === undefined) delete process.env[v];
		else process.env[v] = val;
	}
});

function setTTY(value: boolean | undefined): void {
	Object.defineProperty(process.stdout, "isTTY", {
		value,
		configurable: true,
	});
}

function clearAgentEnv(): void {
	for (const v of AGENT_ENV_VARS) delete process.env[v];
}

describe("matchOrganization", () => {
	const orgs = [orgA, orgB];

	it("matches by id, slug, and name, case-insensitively", () => {
		expect(matchOrganization(orgs, "org-b-uuid")).toBe(orgB);
		expect(matchOrganization(orgs, "BETA")).toBe(orgB);
		expect(matchOrganization(orgs, "acme")).toBe(orgA);
		expect(matchOrganization(orgs, "Beta Co")).toBe(orgB);
	});

	it("returns undefined on no match", () => {
		expect(matchOrganization(orgs, "nope")).toBeUndefined();
	});
});

describe("resolveOrganization", () => {
	it("throws when there are no memberships", async () => {
		await expect(resolveOrganization([], undefined)).rejects.toThrow(
			/No organizations/,
		);
	});

	it("uses the only org when there is exactly one", async () => {
		expect(await resolveOrganization([orgA], undefined)).toBe(orgA);
	});

	it("resolves --org against multiple memberships", async () => {
		expect(await resolveOrganization([orgA, orgB], "beta")).toBe(orgB);
	});

	it("throws with available orgs when --org matches nothing", async () => {
		await expect(resolveOrganization([orgA, orgB], "ghost")).rejects.toThrow(
			/No organization matches "ghost"/,
		);
	});

	it("refuses to guess with multiple orgs on a non-TTY (non-agent) stdout", async () => {
		clearAgentEnv();
		setTTY(false);
		await expect(resolveOrganization([orgA, orgB], undefined)).rejects.toThrow(
			/Multiple organizations/,
		);
	});

	it("refuses to guess with multiple orgs in agent mode even on a TTY", async () => {
		clearAgentEnv();
		process.env.SUPERSET_AGENT = "1";
		setTTY(true);
		await expect(resolveOrganization([orgA, orgB], undefined)).rejects.toThrow(
			/Multiple organizations/,
		);
	});

	it("falls back to the active org with multiple memberships and no --org", async () => {
		clearAgentEnv();
		setTTY(false); // would otherwise refuse — the active-org fallback wins
		expect(await resolveOrganization([orgA, orgB], undefined, orgB.id)).toBe(
			orgB,
		);
	});

	it("prefers an explicit --org over the active org", async () => {
		expect(await resolveOrganization([orgA, orgB], "acme", orgB.id)).toBe(orgA);
	});

	it("ignores a stale active org not in memberships and still refuses", async () => {
		clearAgentEnv();
		setTTY(false);
		await expect(
			resolveOrganization([orgA, orgB], undefined, "not-a-member-uuid"),
		).rejects.toThrow(/Multiple organizations/);
	});
});
