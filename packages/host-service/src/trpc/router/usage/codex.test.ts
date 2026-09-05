import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dedupeCodexAccounts, discoverCodexQuotaTargets } from "./codex";
import { setIdentityBindingRecorder } from "./default-account";
import type { UsageAccount } from "./types";

function account(overrides: Partial<UsageAccount>): UsageAccount {
	return {
		agent: "codex",
		credentialKind: "subscription",
		accountKey: "/home/u/.codex/auth.json",
		sourceLabel: "~/.codex",
		email: null,
		plan: null,
		status: "ok",
		statusDetail: null,
		windows: [],
		creditsBalance: null,
		extraUsage: null,
		selection: null,
		accountId: null,
		inRotation: true,
		managed: true,
		isDefault: false,
		fetchedAt: new Date(0),
		...overrides,
	};
}

/**
 * KTD4: the ChatGPT account id in auth.json is the identity. The email it
 * used to dedupe on comes from the network and is missing whenever the fetch
 * fails, which merged two signed-in homes into one card.
 */
describe("dedupeCodexAccounts", () => {
	it("collapses two homes holding one account id", () => {
		const accounts = dedupeCodexAccounts([
			account({ accountId: "acct-1", selection: null, email: "a@b.c" }),
			// The same login from a second home, its quota fetch having failed,
			// so the email the old dedupe keyed on is missing.
			account({
				accountId: "acct-1",
				selection: "/home/u/.codex-work",
				accountKey: "/home/u/.codex-work/auth.json",
			}),
		]);

		expect(accounts).toHaveLength(1);
		expect(accounts[0]?.selection).toBeNull();
	});

	it("keeps two account ids apart even when the email is unknown", () => {
		const accounts = dedupeCodexAccounts([
			account({ accountId: "acct-1", selection: null }),
			account({
				accountId: "acct-2",
				selection: "/home/u/.codex-work",
				accountKey: "/home/u/.codex-work/auth.json",
			}),
		]);

		expect(accounts.map((one) => one.accountId)).toEqual(["acct-1", "acct-2"]);
	});

	it("falls back to the email for logins with no account id", () => {
		const accounts = dedupeCodexAccounts([
			account({ email: "a@b.c", selection: null }),
			account({
				email: "a@b.c",
				selection: "/home/u/.codex-work",
				accountKey: "/home/u/.codex-work/auth.json",
			}),
		]);

		expect(accounts).toHaveLength(1);
	});
});

/**
 * The quota store deletes the entries a discovery pass omits. A home dir the
 * scan could not read lists no `~/.codex*` siblings at all — identical to a
 * home holding none — so the pass has to report itself incomplete instead of
 * letting every extra home be reaped.
 */
describe("discoverCodexQuotaTargets", () => {
	const codexEnvKeys = [
		"CODEX_HOME",
		"SUPERSET_DEFAULT_CODEX_HOME",
		"SUPERSET_AMBIENT_CODEX_HOME",
	] as const;
	let previousCodexEnv: Array<string | undefined> = [];
	const roots: string[] = [];

	beforeEach(() => {
		previousCodexEnv = codexEnvKeys.map((key) => process.env[key]);
		for (const key of codexEnvKeys) delete process.env[key];
		// Discovery records identity bindings through the engine state; this
		// test only cares about the scan.
		setIdentityBindingRecorder(() => {});
	});

	afterEach(() => {
		for (const [index, key] of codexEnvKeys.entries()) {
			const previous = previousCodexEnv[index];
			if (previous === undefined) delete process.env[key];
			else process.env[key] = previous;
		}
		setIdentityBindingRecorder(null);
		for (const root of roots.splice(0)) {
			rmSync(root, { recursive: true, force: true });
		}
	});

	function tempHome(): string {
		const root = mkdtempSync(join(tmpdir(), "superset-codex-home-"));
		roots.push(root);
		return root;
	}

	it("reports a complete pass for a home dir holding no extra homes", async () => {
		const targets = await discoverCodexQuotaTargets(tempHome());

		expect(targets.selections).toEqual([null]);
		expect(targets.complete).toBe(true);
	});

	it("reports an incomplete pass when the home dir could not be read", async () => {
		const targets = await discoverCodexQuotaTargets(join(tempHome(), "gone"));

		expect(targets.selections).toEqual([null]);
		expect(targets.complete).toBe(false);
	});
});
