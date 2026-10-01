import { describe, expect, it } from "bun:test";
import {
	type ClaudeRuntimeAccount,
	type ClaudeRuntimeStorage,
	switchClaudeRuntimeAccount,
} from "./runtime";

function account(
	selection: string | null,
	email: string,
	token: string,
	organizationUuid?: string,
	expiresAt = 100,
): ClaudeRuntimeAccount {
	return {
		selection,
		credentialsJson: JSON.stringify({
			claudeAiOauth: {
				accessToken: token,
				refreshToken: `${token}-refresh`,
				email,
				organizationUuid,
				expiresAt,
			},
		}),
		oauthAccount: { emailAddress: email, organizationUuid },
	};
}

function harness(accounts: ClaudeRuntimeAccount[]) {
	let selected: ClaudeRuntimeAccount | null = null;
	let runtime = { credentials: [] as string[], oauthAccount: null as unknown };
	const writes: ClaudeRuntimeAccount[] = [];
	const storage: ClaudeRuntimeStorage = {
		readSelection: async () => selected,
		checkpointRuntime: async () => {
			const savedRuntime = runtime;
			const savedSelection = selected;
			return async () => {
				runtime = savedRuntime;
				selected = savedSelection;
			};
		},
		readRuntime: async () => runtime,
		readAccounts: async () => accounts,
		writeAccount: async (value) => {
			writes.push(value);
			accounts = accounts.map((entry) =>
				entry.selection === value.selection ? value : entry,
			);
		},
		writeRuntime: async (value) => {
			runtime = {
				credentials: [value.credentialsJson],
				oauthAccount: value.oauthAccount,
			};
		},
		writeSelection: async (value) => {
			selected = value;
		},
	};
	return {
		storage,
		writes,
		switch: (selection: string | null) =>
			switchClaudeRuntimeAccount(storage, selection, async () => {}),
		refresh: (value: ClaudeRuntimeAccount) => {
			runtime = {
				credentials: [value.credentialsJson],
				oauthAccount: value.oauthAccount,
			};
		},
		get runtime() {
			return runtime;
		},
		get selected() {
			return selected;
		},
	};
}

describe("Claude runtime account switching (Orca regression cases)", () => {
	it("reads back refreshed credentials for the outgoing Claude account before switching", async () => {
		const first = account("one", "one@example.com", "original");
		const refreshed = account(
			"one",
			"one@example.com",
			"refreshed",
			undefined,
			200,
		);
		const second = account("two", "two@example.com", "two");
		const h = harness([first, second]);
		await h.switch("one");
		h.refresh(refreshed);
		await h.switch("two");
		expect(h.writes).toEqual([refreshed]);
		expect(h.runtime.credentials).toEqual([second.credentialsJson]);
		await h.switch("one");
		expect(h.runtime.credentials).toEqual([refreshed.credentialsJson]);
	});

	it("switches accounts without persisting unverified live runtime credentials", async () => {
		const first = account("one", "same@example.com", "one", "org-a");
		const second = account("two", "two@example.com", "two", "org-c");
		const h = harness([first, second]);
		await h.switch("one");
		h.refresh(account("one", "", "unverified", "org-b", 200));
		await h.switch("two");
		expect(h.writes).toEqual([]);
		expect(h.runtime.credentials).toEqual([second.credentialsJson]);
	});

	it("routes refreshed Claude credentials to the matching managed account", async () => {
		const first = account("one", "one@example.com", "one");
		const second = account("two", "two@example.com", "two");
		const refreshed = account(
			"two",
			"two@example.com",
			"refreshed",
			undefined,
			200,
		);
		const h = harness([first, second]);
		await h.switch("one");
		h.refresh(refreshed);
		await h.switch("two");
		expect(h.writes).toEqual([refreshed]);
		expect(h.runtime.credentials).toEqual([refreshed.credentialsJson]);
	});

	it("rejects stale cold-start read-back for an inactive matching account", async () => {
		const first = account("one", "one@example.com", "one", undefined, 200);
		const second = account("two", "two@example.com", "two", undefined, 200);
		const h = harness([first, second]);
		await h.switch("one");
		h.refresh(account("two", "two@example.com", "stale", undefined, 100));
		await h.switch("two");
		expect(h.writes).toEqual([]);
		expect(h.runtime.credentials).toEqual([second.credentialsJson]);
	});

	it("rejects ambiguous Claude read-back instead of choosing a managed account", async () => {
		const h = harness([
			account("one", "same@example.com", "one"),
			account("two", "same@example.com", "two"),
		]);
		await h.switch("one");
		h.refresh(account("one", "same@example.com", "refreshed", undefined, 200));
		await h.switch("two");
		expect(h.writes).toEqual([]);
	});

	it("rejects same-email read-back when another account needs organization proof", async () => {
		const h = harness([
			account("one", "same@example.com", "one"),
			account("two", "same@example.com", "two", "org-b"),
		]);
		await h.switch("one");
		h.refresh(account("one", "same@example.com", "refreshed", undefined, 200));
		await h.switch("two");
		expect(h.writes).toEqual([]);
	});

	it("ignores unrelated org-scoped accounts when reading back no-org credentials", async () => {
		const refreshed = account(
			"one",
			"one@example.com",
			"refreshed",
			undefined,
			200,
		);
		const h = harness([
			account("one", "one@example.com", "one"),
			account("two", "two@example.com", "two", "org-b"),
		]);
		await h.switch("one");
		h.refresh(refreshed);
		await h.switch("two");
		expect(h.writes).toEqual([refreshed]);
	});

	it("rejects same-email read-back with conflicting organization for no-org accounts", async () => {
		const h = harness([
			account("one", "same@example.com", "one"),
			account("two", "same@example.com", "two", "org-b"),
		]);
		await h.switch("one");
		h.refresh(account("one", "same@example.com", "refreshed", "org-c", 200));
		await h.switch("two");
		expect(h.writes).toEqual([]);
	});

	it("restores the previous runtime and selection when committing the switch fails", async () => {
		const first = account("one", "one@example.com", "one");
		const h = harness([first, account("two", "two@example.com", "two")]);
		await h.switch("one");
		await expect(
			switchClaudeRuntimeAccount(h.storage, "two", async () => {
				throw new Error("commit failed");
			}),
		).rejects.toThrow("commit failed");
		expect(h.selected).toEqual(first);
		expect(h.runtime.credentials).toEqual([first.credentialsJson]);
	});

	it("does not mutate the runtime when selected credentials are unavailable", async () => {
		const h = harness([account("one", "one@example.com", "one")]);
		await h.switch("one");
		const before = h.runtime;
		await expect(h.switch("missing")).rejects.toThrow(
			"no readable subscription credentials",
		);
		expect(h.runtime).toEqual(before);
	});
	it("preserves unverified live credentials when syncing the same account", async () => {
		const h = harness([account("one", "one@example.com", "one", "org-a")]);
		await h.switch("one");
		const unverified = account("one", "", "live-refresh", "org-b", 200);
		h.refresh(unverified);
		await h.switch("one");
		expect(h.writes).toEqual([]);
		expect(h.runtime.credentials).toEqual([unverified.credentialsJson]);
	});
});
