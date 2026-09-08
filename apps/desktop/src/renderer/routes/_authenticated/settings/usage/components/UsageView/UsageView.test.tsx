import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document. Process-wide, so this
// unregisters in afterAll to leave the other renderer suites their document.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The card errors live in `UsageView`'s own state, so they are only reachable
// by rendering the whole view. Three modules stand in the way: the sections
// above and below the cards reach for the router and the cloud API, and the
// switch itself goes to the host. The accounts arrive through the seeded query
// cache instead of a stubbed host client — `mock.module` is process-wide and
// the sibling hook suites already own that module for the whole run.
// Spread the real modules: a partial stub would strip their other exports from
// every suite in the same run. Snapshot into plain objects: `mock.module`
// rewrites the live namespace in place, so spreading the namespace itself in
// `afterAll` would restore the stub.
// The leaderboard card's module graph builds the IPC tRPC client at import
// time, and only the preload exposes that bridge — a no-op stands in for it.
(
	globalThis as {
		electronTRPC?: { sendMessage: () => void; onMessage: () => void };
	}
).electronTRPC = { sendMessage: () => {}, onMessage: () => {} };

const realLeaderboardCard = { ...(await import("../LeaderboardCard")) };
const realUsageHistorySection = {
	...(await import("../UsageHistorySection")),
};
const realSetDefaultUsageAccount = {
	...(await import("../../hooks/useSetDefaultUsageAccount")),
};

/** Selections the stubbed switch refuses, by engine code. */
let switchRefusals: Record<string, string> = {};
/** A selection whose switch never answers, so its card stays mid-switch. */
let switchPending: string | null = null;
mock.module("../LeaderboardCard", () => ({ LeaderboardCard: () => null }));
mock.module("../UsageHistorySection", () => ({
	UsageHistorySection: () => null,
}));
mock.module("../../hooks/useSetDefaultUsageAccount", () => ({
	useSetDefaultUsageAccount: () => ({
		isPending: false,
		mutate: (
			{ selection }: { selection: string | null },
			{
				onSuccess,
				onError,
			}: { onSuccess: () => void; onError: (failure: unknown) => void },
		) => {
			if (selection !== null && selection === switchPending) return;
			const code = selection === null ? undefined : switchRefusals[selection];
			if (code) onError(new Error(code));
			else onSuccess();
		},
	}),
}));

const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { cleanup, fireEvent, render, waitFor, within } = await import(
	"@testing-library/react"
);
const { HOST_USAGE_QUOTA_QUERY_KEY } = await import(
	"../../hooks/useHostUsageQuota"
);
const { ACCOUNT_ENGINE_QUERY_KEY } = await import(
	"../../hooks/useAccountEngineSettings"
);
const { AccountCard, sessionMoveNote, UsageView } = await import("./UsageView");

afterEach(() => {
	cleanup();
	switchPending = null;
});
afterAll(async () => {
	// `mock.module` is process-wide and `mock.restore` does not undo it, so the
	// real modules go back before the next suite in this run asks for them.
	mock.module("../LeaderboardCard", () => ({ ...realLeaderboardCard }));
	mock.module("../UsageHistorySection", () => ({
		...realUsageHistorySection,
	}));
	mock.module("../../hooks/useSetDefaultUsageAccount", () => ({
		...realSetDefaultUsageAccount,
	}));
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

type Account = Parameters<typeof AccountCard>[0]["account"];

function account(overrides: Partial<Account> = {}): Account {
	return {
		agent: "claude",
		credentialKind: "subscription",
		accountKey: "claude:/p/a",
		sourceLabel: "~/.claude",
		email: "a@example.com",
		plan: "max",
		status: "ok",
		statusDetail: null,
		windows: [],
		creditsBalance: null,
		extraUsage: null,
		selection: "/p/a",
		accountId: "uuid-a",
		inRotation: true,
		managed: true,
		isDefault: false,
		fetchedAt: new Date(0),
		...overrides,
	} as Account;
}

function renderCard(
	value: Account,
	props: Partial<Parameters<typeof AccountCard>[0]> = {},
) {
	return render(
		<AccountCard
			account={value}
			onMakeActive={() => {}}
			onToggleRotation={() => {}}
			onSwitchSignIn={null}
			onRemove={null}
			isActivating={false}
			isSwitching={false}
			error={null}
			selectable
			hideEmails={false}
			{...props}
		/>,
	);
}

describe("post-switch confirmation", () => {
	// The engine restarts Codex sessions with resume at their next idle
	// moment, and a Claude session on its own profile dir too, so the old
	// single sentence ("move over without being relaunched") was a promise the
	// switch does not keep.
	test("the note reads true for each agent's sessions", () => {
		expect(sessionMoveNote("claude")).toBe(
			"Running sessions pick up the new login in place; ones on their own profile restart when they go idle.",
		);
		expect(sessionMoveNote("codex")).toBe(
			"Running sessions move over when they go idle, resuming where they left off.",
		);
		for (const agent of ["claude", "codex"] as const) {
			expect(sessionMoveNote(agent)).not.toContain("without being relaunched");
		}
	});

	// KTD13: on win32 `usage.setDefaultAccount` takes the pointer-only branch
	// ("Only the swap of already-running sessions is lost") and still resolves
	// success, so this same confirmation ran and told the user their running
	// sessions had already moved. They never relaunched, and every live session
	// kept spending the old account's quota.
	test("a host that cannot swap live sessions says to restart them", () => {
		for (const agent of ["claude", "codex"] as const) {
			expect(sessionMoveNote(agent, false)).toBe(
				"New sessions use it; sessions already running keep the previous login until you restart them.",
			);
		}
	});
});

describe("AccountCard active indicator", () => {
	test("only the active account says Active; the rest offer the switch", () => {
		const view = render(
			<>
				<AccountCard
					account={account({ isDefault: true, email: "active@example.com" })}
					onMakeActive={null}
					onToggleRotation={() => {}}
					onSwitchSignIn={null}
					onRemove={null}
					isActivating={false}
					isSwitching={false}
					error={null}
					selectable
					hideEmails={false}
				/>
				<AccountCard
					account={account({
						accountKey: "claude:/p/b",
						accountId: "uuid-b",
						email: "spare@example.com",
					})}
					onMakeActive={() => {}}
					onToggleRotation={() => {}}
					onSwitchSignIn={null}
					onRemove={null}
					isActivating={false}
					isSwitching={false}
					error={null}
					selectable
					hideEmails={false}
				/>
			</>,
		);
		const ui = within(view.baseElement as HTMLElement);
		expect(ui.getAllByText("Active")).toHaveLength(1);
		expect(ui.getAllByText("Make active")).toHaveLength(1);
		// The old wording promised something the engine no longer does.
		expect(view.baseElement.textContent).not.toContain(
			"Default for new agents",
		);
	});

	test("a switch in flight says so on the card that asked", () => {
		const view = renderCard(account(), { isActivating: true });
		expect(
			within(view.baseElement as HTMLElement).getByText("Switching…"),
		).toBeTruthy();
	});

	test("a refused switch explains itself and leaves the indicator alone", () => {
		const view = renderCard(account(), {
			error:
				"Switch failed (swap-verify-failed). The previous account is still active.",
		});
		const ui = within(view.baseElement as HTMLElement);
		expect(ui.getByRole("alert").textContent).toContain("swap-verify-failed");
		expect(ui.queryByText("Active")).toBeNull();
		expect(ui.getByText("Make active")).toBeTruthy();
	});
});

describe("AccountCard rotation", () => {
	test("the toggle reports the value the user asked for", () => {
		const calls: boolean[] = [];
		const view = renderCard(account({ inRotation: true }), {
			onToggleRotation: (next: boolean) => calls.push(next),
		});
		const toggle = within(view.baseElement as HTMLElement).getByRole("switch");
		expect(toggle.getAttribute("aria-checked")).toBe("true");
		fireEvent.click(toggle);
		expect(calls).toEqual([false]);
	});

	// `isEligible` refuses an unreadable token before it reads the rotation
	// flag, and "unavailable" is the steady state for an org-managed plan. The
	// badge says the numbers could not be read, which a user does not read as
	// "never auto-selected" — so the sentence beside it must not promise the
	// switch that will not come.
	test("a token the engine will not auto-select promises no automatic switch", () => {
		const rotationPromise =
			"Automatic switching may move sessions onto this account. Held-out accounts stay available to pick by hand.";
		const view = renderCard(account({ status: "unavailable" }));
		const ui = within(view.baseElement as HTMLElement);
		expect(view.baseElement.textContent).toContain("Unavailable");
		// The toggle and the saved preference stay: the statuses it would key
		// off are transient often enough that either would move on its own.
		expect(ui.getByRole("switch").getAttribute("aria-checked")).toBe("true");
		expect(ui.queryByTitle(rotationPromise)).toBeNull();
		cleanup();
		const readable = renderCard(account({ status: "ok" }));
		expect(
			within(readable.baseElement as HTMLElement).queryByTitle(rotationPromise),
		).toBeTruthy();
	});

	test("agents the engine cannot switch get no toggle at all", () => {
		const view = renderCard(account(), { onToggleRotation: null });
		expect(
			within(view.baseElement as HTMLElement).queryByRole("switch"),
		).toBeNull();
	});
});

describe("AccountCard account state", () => {
	test("a stale token reads as eligible, not as a sign-in problem", () => {
		const view = renderCard(account({ status: "token_stale" }));
		const text = view.baseElement.textContent ?? "";
		expect(text).toContain("Stale token, still eligible");
		expect(text).not.toContain("Sign-in expired");
		expect(text).not.toContain("Signed out");
	});

	test("an unmanaged login says Superset will not touch it", () => {
		const view = renderCard(account({ managed: false }));
		const text = view.baseElement.textContent ?? "";
		expect(text).toContain("Unmanaged");
		expect(text).toContain("switching leaves this login alone");
	});

	// #11: the card promises switching never writes to this login, so it must
	// not offer a control that would — not the button, not the rotation
	// toggle, and not the selectable circle that would sit there doing nothing.
	test("an unmanaged login offers no way to switch onto it", () => {
		const view = renderCard(account({ managed: false }));
		const ui = within(view.baseElement as HTMLElement);
		expect(ui.queryByText("Make active")).toBeNull();
		expect(ui.queryByRole("switch")).toBeNull();
		expect(
			ui.queryByTitle(
				"Make active — running sessions move to this account too.",
			),
		).toBeNull();
	});

	// Grok and Antigravity keep one login per machine, so every card of theirs
	// is `managed: false`. The badge would then sit on a normal, only-possible
	// login and warn about a switch mechanism those agents never had.
	test("an agent with one login per machine is not called unmanaged", () => {
		const view = renderCard(
			account({
				agent: "grok",
				accountKey: "grok:default",
				sourceLabel: "~/.grok",
				email: "grok@example.com",
				selection: null,
				accountId: "uuid-grok",
				managed: false,
			}),
		);
		const text = view.baseElement.textContent ?? "";
		expect(text).not.toContain("Unmanaged");
		expect(text).not.toContain("switching leaves this login alone");
	});

	// The same promise covers the ⋯ menu: "Switch sign-in…" writes this login
	// and "Remove…" deletes its directory. With neither left there is nothing
	// to open, so the menu itself goes too.
	test("an unmanaged login offers no way to rewrite or delete it", () => {
		const managed = renderCard(account(), {
			onSwitchSignIn: () => {},
			onRemove: () => {},
		});
		// Counts, not the elements: a failed assertion on a node serializes the
		// whole card into the diff, which costs seconds.
		expect(
			managed.baseElement.querySelectorAll('[aria-haspopup="menu"]').length,
		).toBe(1);
		cleanup();
		const view = renderCard(account({ managed: false }), {
			onSwitchSignIn: () => {},
			onRemove: () => {},
		});
		expect(
			view.baseElement.querySelectorAll('[aria-haspopup="menu"]').length,
		).toBe(0);
	});
});

describe("UsageView card errors", () => {
	// No host, so the seeded quota is all the page reads and none of the other
	// queries on it fire.
	function renderUsageView(accounts: Account[]) {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		queryClient.setQueryData([...HOST_USAGE_QUOTA_QUERY_KEY, null], accounts);
		const view = render(
			<QueryClientProvider client={queryClient}>
				<UsageView hostUrl={null} />
			</QueryClientProvider>,
		);
		const ui = within(view.baseElement as HTMLElement);
		const cardFor = (email: string) =>
			within(ui.getByText(email).closest(".group") as HTMLElement);
		return cardFor;
	}

	// A refusal says the previous account is still active. Once another card's
	// switch succeeds that is no longer true, and the two lines contradicted
	// each other on screen until the user clicked the refused card again.
	test("a successful switch clears the refusals it made untrue, and only those", () => {
		const accounts = [
			account({
				isDefault: true,
				accountKey: "claude:/p/a",
				selection: "/p/a",
				accountId: "uuid-a",
			}),
			account({
				accountKey: "claude:/p/b",
				selection: "/p/b",
				accountId: "uuid-b",
				email: "b@example.com",
			}),
			account({
				accountKey: "claude:/p/c",
				selection: "/p/c",
				accountId: "uuid-c",
				email: "c@example.com",
			}),
			account({
				agent: "codex",
				accountKey: "codex:/p/d",
				selection: "/p/d",
				accountId: "uuid-d",
				sourceLabel: "~/.codex",
				email: "d@example.com",
			}),
		];
		switchRefusals = { "/p/b": "swap-verify-failed", "/p/d": "lock-loser" };
		const cardFor = renderUsageView(accounts);

		fireEvent.click(cardFor("b@example.com").getByText("Make active"));
		expect(cardFor("b@example.com").getByRole("alert").textContent).toContain(
			"swap-verify-failed",
		);
		fireEvent.click(cardFor("d@example.com").getByText("Make active"));
		expect(cardFor("d@example.com").getByRole("alert").textContent).toContain(
			"Another Superset instance",
		);

		fireEvent.click(cardFor("c@example.com").getByText("Make active"));
		// A count, not the node: a failed assertion on an element serializes the
		// whole card into the diff, which costs seconds.
		expect(cardFor("b@example.com").queryAllByRole("alert")).toHaveLength(0);
		// The Codex refusal is about a switch this one did not perform.
		expect(cardFor("d@example.com").getByRole("alert").textContent).toContain(
			"Another Superset instance",
		);
	});

	// A rotation refusal says nothing about which account is active, so a
	// switch elsewhere succeeding does not make it untrue. Erasing it left the
	// rolled-back toggle reading "on" after the user turned it off, with
	// nothing on screen left to say why.
	test("a successful switch keeps a rotation refusal it did not make untrue", async () => {
		const accounts = [
			account({
				isDefault: true,
				accountKey: "claude:/p/a",
				selection: "/p/a",
				accountId: "uuid-a",
			}),
			account({
				accountKey: "claude:/p/b",
				selection: "/p/b",
				accountId: "uuid-b",
				email: "b@example.com",
			}),
			account({
				accountKey: "claude:/p/c",
				selection: "/p/c",
				accountId: "uuid-c",
				email: "c@example.com",
			}),
		];
		switchRefusals = { "/p/b": "swap-verify-failed" };
		const cardFor = renderUsageView(accounts);

		// No host, so the rotation write refuses and the hook rolls the toggle
		// back to where it was.
		fireEvent.click(cardFor("a@example.com").getByRole("switch"));
		await waitFor(() =>
			expect(cardFor("a@example.com").getByRole("alert").textContent).toContain(
				"Rotation not saved",
			),
		);
		fireEvent.click(cardFor("b@example.com").getByText("Make active"));
		expect(cardFor("b@example.com").getByRole("alert").textContent).toContain(
			"swap-verify-failed",
		);

		fireEvent.click(cardFor("c@example.com").getByText("Make active"));
		expect(cardFor("a@example.com").getByRole("alert").textContent).toContain(
			"Rotation not saved",
		);
		expect(
			cardFor("a@example.com").getByRole("switch").getAttribute("aria-checked"),
		).toBe("true");
		// The switch refusal the same switch did make untrue still goes.
		expect(cardFor("b@example.com").queryAllByRole("alert")).toHaveLength(0);
	});

	// `dedupeClaudeCredentials` deliberately keeps one login found in two dirs
	// as two rows: one provider account, two run targets. Keyed by the account
	// they share, one card's refusal landed on both, and a card that asked for
	// nothing showed a failure.
	function duplicateAccountIdAccounts() {
		return [
			account({
				isDefault: true,
				accountKey: "claude:/p/a",
				selection: "/p/a",
				accountId: "uuid-a",
			}),
			account({
				accountKey: "claude:/p/live",
				selection: "/p/live",
				accountId: "uuid-dup",
				email: "live@example.com",
			}),
			account({
				accountKey: "claude:/p/copy",
				selection: "/p/copy",
				accountId: "uuid-dup",
				email: "copy@example.com",
			}),
		];
	}

	test("a refused switch stays on the run target that asked for it", () => {
		switchRefusals = { "/p/live": "swap-verify-failed" };
		const cardFor = renderUsageView(duplicateAccountIdAccounts());

		fireEvent.click(cardFor("live@example.com").getByText("Make active"));
		expect(
			cardFor("live@example.com").getByRole("alert").textContent,
		).toContain("swap-verify-failed");
		// A count, not the node: a failed assertion on an element serializes
		// the whole card into the diff, which costs seconds.
		expect(cardFor("copy@example.com").queryAllByRole("alert")).toHaveLength(0);
	});

	test("only the card mid-switch says it is switching", () => {
		switchRefusals = {};
		switchPending = "/p/live";
		const cardFor = renderUsageView(duplicateAccountIdAccounts());

		fireEvent.click(cardFor("live@example.com").getByText("Make active"));
		expect(cardFor("live@example.com").getByText("Switching…")).toBeTruthy();
		expect(
			cardFor("copy@example.com").queryAllByText("Switching…"),
		).toHaveLength(0);
		expect(cardFor("copy@example.com").getByText("Make active")).toBeTruthy();
	});

	// One `useSetAccountRotation` drives every row, so a second `mutate` on it
	// detaches the observer from the first: the first toggle's per-call
	// `onError` never ran and its refusal went unsaid, leaving a toggle that
	// sprang back with nothing on screen to explain why.
	test("a rotation refusal reaches its row when another toggle supersedes it", async () => {
		switchRefusals = {};
		const cardFor = renderUsageView([
			account({
				isDefault: true,
				accountKey: "claude:/p/a",
				selection: "/p/a",
				accountId: "uuid-a",
			}),
			account({
				accountKey: "claude:/p/b",
				selection: "/p/b",
				accountId: "uuid-b",
				email: "b@example.com",
			}),
		]);

		// No host, so both rotation writes refuse. The second click lands while
		// the first is still in flight, which is the case that lost it.
		fireEvent.click(cardFor("a@example.com").getByRole("switch"));
		fireEvent.click(cardFor("b@example.com").getByRole("switch"));

		await waitFor(() =>
			expect(cardFor("a@example.com").getByRole("alert").textContent).toContain(
				"Rotation not saved",
			),
		);
		expect(cardFor("b@example.com").getByRole("alert").textContent).toContain(
			"Rotation not saved",
		);
	});

	// The other half of the split: the two rows share one rotation flag, so a
	// refusal to write it is true of both cards and belongs on both.
	test("a rotation refusal reaches every card behind the same flag", async () => {
		switchRefusals = {};
		const cardFor = renderUsageView(duplicateAccountIdAccounts());

		// No host, so the rotation write refuses.
		fireEvent.click(cardFor("live@example.com").getByRole("switch"));
		await waitFor(() =>
			expect(
				cardFor("live@example.com").getByRole("alert").textContent,
			).toContain("Rotation not saved"),
		);
		expect(
			cardFor("copy@example.com").getByRole("alert").textContent,
		).toContain("Rotation not saved");
		// A card of a different provider account is not behind that flag.
		expect(cardFor("a@example.com").queryAllByRole("alert")).toHaveLength(0);
	});
});

describe("UsageView switch history", () => {
	// `useSwitchHistory` is disabled without a host, and a disabled query stays
	// pending with `isError` false. Gating the loading state on `hostUrl` made
	// the section fall through to its empty branch and assert that no switch
	// ever happened, about a read that never ran — while the quota sections
	// above it were still saying "Reading usage…" for the same reason.
	test("an unread history says so instead of claiming nothing happened", () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		queryClient.setQueryData([...HOST_USAGE_QUOTA_QUERY_KEY, null], []);
		const view = render(
			<QueryClientProvider client={queryClient}>
				<UsageView hostUrl={null} />
			</QueryClientProvider>,
		);
		const text = view.baseElement.textContent ?? "";
		expect(text).toContain("Reading switch history…");
		expect(text).not.toContain("No account switches yet");
	});
});

describe("UsageView on a host that cannot swap live sessions", () => {
	// Only the fields the view reads; the panel below it is not what this is
	// about.
	function renderOnWindowsHost() {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		queryClient.setQueryData(
			[...HOST_USAGE_QUOTA_QUERY_KEY, null],
			[
				account({ isDefault: true }),
				account({
					accountKey: "claude:/p/b",
					selection: "/p/b",
					accountId: "uuid-b",
					email: "b@example.com",
				}),
			],
		);
		queryClient.setQueryData([...ACCOUNT_ENGINE_QUERY_KEY, null], {
			engineAvailable: true,
			platformSupported: false,
			lockOwner: true,
			settings: null,
		});
		return render(
			<QueryClientProvider client={queryClient}>
				<UsageView hostUrl={null} />
			</QueryClientProvider>,
		);
	}

	test("the section says new sessions only, not that running ones moved", () => {
		const view = renderOnWindowsHost();
		const text = view.baseElement.textContent ?? "";
		expect(text).toContain(
			"Newly launched Claude Code sessions use the active account; ones already running keep the previous login until you restart them.",
		);
		expect(text).not.toContain("Every running and newly launched");
	});

	test("the card titles make the same promise the host keeps", () => {
		const view = renderOnWindowsHost();
		const ui = within(view.baseElement as HTMLElement);
		expect(
			ui.queryAllByTitle(
				"Active — every newly launched session of this agent uses this account; ones already running keep the previous login until you restart them.",
			).length,
		).toBeGreaterThan(0);
		expect(
			ui.queryAllByTitle(
				"Make active — sessions launched from now on use this account.",
			).length,
		).toBeGreaterThan(0);
		expect(
			ui.queryAllByTitle(
				"Active — every running and newly launched session of this agent uses this account.",
			),
		).toHaveLength(0);
		expect(
			ui.queryAllByTitle(
				"Make active — running sessions move to this account too.",
			),
		).toHaveLength(0);
	});
});

describe("UsageView auto-switch with nowhere to go", () => {
	const AUTO_SWITCH_SETTINGS = {
		enabled: true,
		thresholdPercent: 90,
		strategy: "best",
		modelWindows: [],
		pollIntervalSeconds: 60,
		cooldownSeconds: 300,
	};

	function renderWithEngine(accounts: Account[]) {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		queryClient.setQueryData([...HOST_USAGE_QUOTA_QUERY_KEY, null], accounts);
		// Only the fields the view reads, with none of the three blocked states.
		queryClient.setQueryData([...ACCOUNT_ENGINE_QUERY_KEY, null], {
			engineAvailable: true,
			platformSupported: true,
			lockOwner: true,
			settings: {
				claude: AUTO_SWITCH_SETTINGS,
				codex: AUTO_SWITCH_SETTINGS,
			},
		});
		const view = render(
			<QueryClientProvider client={queryClient}>
				<UsageView hostUrl={null} />
			</QueryClientProvider>,
		);
		return { text: view.baseElement.textContent ?? "", view };
	}

	const CLAUDE_NOTE =
		"Nothing to switch to yet: this needs another Claude Code account with In rotation turned on.";

	// The panel renders directly under "No Claude Code logins on this host"
	// with a live enabled toggle, and the engine's only word about finding no
	// candidate is an exhaustion notice at limit-time, hours later.
	test("a lone login is told the switch has nowhere to go", () => {
		const { text } = renderWithEngine([account({ isDefault: true })]);
		expect(text).toContain(CLAUDE_NOTE);
	});

	// The correction that shapes this: login count is not the predicate.
	// `isEligible` reads the rotation flag, so a second account held out of
	// rotation leaves the engine exactly as stuck as one account does.
	test("a second account held out of rotation is just as inert", () => {
		const { text } = renderWithEngine([
			account({ isDefault: true }),
			account({
				accountKey: "claude:/p/b",
				selection: "/p/b",
				accountId: "uuid-b",
				email: "b@example.com",
				inRotation: false,
			}),
		]);
		expect(text).toContain(CLAUDE_NOTE);
	});

	test("a candidate the engine would accept drops the note", () => {
		const { text } = renderWithEngine([
			account({ isDefault: true }),
			account({
				accountKey: "claude:/p/b",
				selection: "/p/b",
				accountId: "uuid-b",
				email: "b@example.com",
			}),
		]);
		expect(text).not.toContain(CLAUDE_NOTE);
		// Codex still has none, and the note is per agent.
		expect(text).toContain(
			"Nothing to switch to yet: this needs another Codex account with In rotation turned on.",
		);
	});

	// The setting is legitimately configured before the second account is
	// added and is persisted host-side, so the note explains the panel — it
	// does not take it away.
	test("the note explains the panel instead of disabling it", () => {
		const { view } = renderWithEngine([account({ isDefault: true })]);
		const ui = within(view.baseElement as HTMLElement);
		const toggles = ui.getAllByRole("switch", {
			name: "Switch accounts automatically",
		});
		expect(toggles).toHaveLength(2);
		// Still on, still the host's value, with the thresholds it governs.
		for (const toggle of toggles) {
			expect(toggle.getAttribute("aria-checked")).toBe("true");
		}
		expect(ui.getAllByRole("spinbutton", { name: "Switch at" })).toHaveLength(
			2,
		);
	});
});
