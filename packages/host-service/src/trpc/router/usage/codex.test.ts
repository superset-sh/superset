import { describe, expect, it } from "bun:test";
import { dedupeCodexAccounts } from "./codex";
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
