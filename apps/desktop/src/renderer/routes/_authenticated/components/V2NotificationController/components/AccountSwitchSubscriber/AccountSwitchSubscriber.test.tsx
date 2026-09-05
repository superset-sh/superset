import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type {
	AccountEngineStatePayload,
	AccountSwitchedPayload,
} from "@superset/workspace-client";

// happy-dom over the preloaded plain-object document — the subscriber mounts
// through @testing-library/react. Process-wide, so this unregisters in
// afterAll to leave the other renderer suites their document.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type BusListener = (scope: string, payload: unknown) => void;

/** Keyed by `${hostUrl}|${eventType}`: the latches under test are per host,
 * so a test has to be able to deliver an event to one host only. */
const busListeners = new Map<string, Set<BusListener>>();
let busRetainCount = 0;

// Snapshot the real modules: `mock.module` is process-wide, so a partial stub
// would strip the other exports from every suite in the same run. Copied
// rather than held as namespaces, because `mock.module` rewrites the live
// namespace in place — a namespace captured here would hand the stub back to
// the `afterAll` that is meant to undo it.
const realHostEventBus = { ...(await import("renderer/lib/host-event-bus")) };
const realTrpcClient = { ...(await import("renderer/lib/trpc-client")) };
const realSonner = { ...(await import("@superset/ui/sonner")) };

mock.module("renderer/lib/host-event-bus", () => ({
	...realHostEventBus,
	getHostEventBus: (hostUrl: string) => ({
		on: (type: string, _scope: string, callback: BusListener) => {
			const key = `${hostUrl}|${type}`;
			const listeners = busListeners.get(key) ?? new Set<BusListener>();
			listeners.add(callback);
			busListeners.set(key, listeners);
			return () => listeners.delete(callback);
		},
		retain: () => {
			busRetainCount += 1;
			return () => {
				busRetainCount -= 1;
			};
		},
	}),
}));

interface NativeNotification {
	title: string;
	body: string;
	silent?: boolean;
}

const shown: NativeNotification[] = [];

mock.module("renderer/lib/trpc-client", () => ({
	...realTrpcClient,
	electronTrpcClient: {
		notifications: {
			showNative: {
				mutate: async (input: NativeNotification) => {
					shown.push(input);
					return { success: true };
				},
			},
		},
	},
}));

interface HistoryEntry {
	at: number;
	agent: "claude" | "codex";
	reasonKind: string;
}

let historyEntries: HistoryEntry[] = [];
let historyError: Error | null = null;
/** Held open by the race test so an event can land mid-load. */
let historyGate: Promise<void> | null = null;

const loadHistory = async () => {
	if (historyGate) await historyGate;
	if (historyError) throw historyError;
	return { entries: historyEntries };
};

const toasts: string[] = [];

mock.module("@superset/ui/sonner", () => ({
	...realSonner,
	toast: {
		info: (message: string) => toasts.push(message),
	},
}));

const { ACCOUNT_ENGINE_QUERY_KEY } = await import(
	"renderer/routes/_authenticated/settings/usage/hooks/useAccountEngineSettings"
);
const { HOST_USAGE_QUOTA_QUERY_KEY } = await import(
	"renderer/routes/_authenticated/settings/usage/hooks/useHostUsageQuota"
);
const { SWITCH_HISTORY_QUERY_KEY } = await import(
	"renderer/routes/_authenticated/settings/usage/hooks/useSwitchHistory"
);
const { act, cleanup, render } = await import("@testing-library/react");
const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { AccountSwitchSubscriber } = await import("./AccountSwitchSubscriber");

afterEach(cleanup);
afterAll(async () => {
	// `mock.module` is process-wide and `mock.restore` does not undo it, so the
	// real modules go back before the next suite in this run imports them.
	mock.module("renderer/lib/host-event-bus", () => ({ ...realHostEventBus }));
	mock.module("renderer/lib/trpc-client", () => ({ ...realTrpcClient }));
	mock.module("@superset/ui/sonner", () => ({ ...realSonner }));
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

beforeEach(() => {
	shown.length = 0;
	toasts.length = 0;
	busListeners.clear();
	historyEntries = [];
	historyError = null;
	historyGate = null;
	localStorage.clear();
});

// Dedupe latches and the "summary already shown" set are module-level, so
// they outlive a test. Every case below uses its own host URL and its own
// `at` timestamps rather than resetting private state.
const WORKSPACE = {
	workspaceId: "workspace-1",
	workspaceName: "Fix the login page",
	paneLayout: null,
};

async function mountSubscriber(hostUrl: string) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	// Seed each key so `getQueryState` can report whether it was invalidated.
	const keys = [
		[...HOST_USAGE_QUOTA_QUERY_KEY, hostUrl],
		[...ACCOUNT_ENGINE_QUERY_KEY, hostUrl],
		[...SWITCH_HISTORY_QUERY_KEY, hostUrl],
	];
	for (const key of keys) queryClient.setQueryData(key, []);

	await act(async () => {
		render(
			<QueryClientProvider client={queryClient}>
				<AccountSwitchSubscriber
					hostUrl={hostUrl}
					workspaces={[WORKSPACE]}
					loadHistory={loadHistory}
				/>
			</QueryClientProvider>,
		);
	});

	return {
		invalidatedKeys: () =>
			keys
				.filter((key) => queryClient.getQueryState(key)?.isInvalidated)
				.map(([head]) => head),
	};
}

/** Delivers to every mounted host, or to `hostUrl` alone when one is named. */
async function emit(
	type: string,
	scope: string,
	payload: unknown,
	hostUrl?: string,
) {
	await act(async () => {
		for (const [key, listeners] of busListeners) {
			const separator = key.lastIndexOf("|");
			if (key.slice(separator + 1) !== type) continue;
			if (hostUrl !== undefined && key.slice(0, separator) !== hostUrl)
				continue;
			for (const listener of listeners) listener(scope, payload);
		}
	});
}

function switched(
	overrides: Partial<AccountSwitchedPayload> & { at: number },
): AccountSwitchedPayload {
	return {
		agent: "claude",
		fromAccountId: "account-a",
		fromLabel: "work@example.com",
		toAccountId: "account-b",
		toLabel: "personal@example.com",
		reasonKind: "threshold",
		windowId: "five_hour",
		usedPercent: 91,
		...overrides,
	};
}

function engineState(
	overrides: Partial<AccountEngineStatePayload> & { occurredAt: number },
): AccountEngineStatePayload {
	return {
		agent: "claude",
		enabled: true,
		activeAccountId: "account-b",
		cooldownUntil: null,
		exhausted: false,
		lockOwner: true,
		...overrides,
	};
}

describe("switch notifications", () => {
	test("an automatic switch notifies and refreshes the usage queries", async () => {
		const { invalidatedKeys } = await mountSubscriber("http://host-switch");

		await emit("account:switched", "claude", switched({ at: 1_001 }));

		expect(shown).toEqual([
			{
				silent: true,
				title: "Claude switched from work@example.com to personal@example.com",
				body: "5-hour window at 91%",
			},
		]);
		expect(invalidatedKeys()).toEqual([
			HOST_USAGE_QUOTA_QUERY_KEY[0],
			ACCOUNT_ENGINE_QUERY_KEY[0],
			SWITCH_HISTORY_QUERY_KEY[0],
		]);
	});

	test("the same switch delivered twice notifies once", async () => {
		await mountSubscriber("http://host-duplicate");
		const payload = switched({ at: 2_002 });

		await emit("account:switched", "claude", payload);
		await emit("account:switched", "claude", payload);

		expect(shown).toHaveLength(1);
	});

	// The dedupe set is module-level, so keying it by agent and timestamp alone
	// let one host's switch swallow another host's identical-looking one.
	test("two hosts switching at the same instant both notify", async () => {
		await mountSubscriber("http://host-two-switch-a");
		await mountSubscriber("http://host-two-switch-b");
		const payload = switched({ at: 2_500 });

		await emit(
			"account:switched",
			"claude",
			payload,
			"http://host-two-switch-a",
		);
		await emit(
			"account:switched",
			"claude",
			payload,
			"http://host-two-switch-b",
		);

		expect(shown).toHaveLength(2);
	});

	test("a manual switch stays silent but still refreshes the page", async () => {
		const { invalidatedKeys } = await mountSubscriber("http://host-manual");

		await emit(
			"account:switched",
			"codex",
			switched({ at: 3_003, agent: "codex", reasonKind: "manual" }),
		);

		expect(shown).toEqual([]);
		expect(invalidatedKeys()).toContain(HOST_USAGE_QUOTA_QUERY_KEY[0]);
	});

	// Both the "most headroom" and the consume-first strategies emit
	// `reasonKind: "strategy"`, so the body must not name either one.
	test("a proactive move reads the same whichever strategy made it", async () => {
		await mountSubscriber("http://host-strategy");

		await emit(
			"account:switched",
			"claude",
			switched({ at: 4_500, reasonKind: "strategy" }),
		);

		expect(shown[0]?.body).toBe("More headroom elsewhere");
	});

	test("a model window names the model", async () => {
		await mountSubscriber("http://host-model");

		await emit(
			"account:switched",
			"claude",
			switched({
				at: 4_004,
				fromLabel: null,
				windowId: "weekly_scoped:Opus",
				usedPercent: 100,
			}),
		);

		expect(shown[0]).toEqual({
			silent: true,
			title: "Claude switched to personal@example.com",
			body: "Opus weekly window at 100%",
		});
	});
});

describe("engine state notices", () => {
	test("exhaustion notifies once per episode", async () => {
		await mountSubscriber("http://host-exhausted");

		await emit(
			"account:engine-state",
			"claude",
			engineState({ occurredAt: 5_005, exhausted: true }),
		);
		await emit(
			"account:engine-state",
			"claude",
			engineState({ occurredAt: 5_006, exhausted: true }),
		);
		expect(shown).toHaveLength(1);
		expect(shown[0]?.title).toBe("All Claude accounts are at their limit");

		// Recovered, then exhausted again: a new episode is worth telling.
		await emit(
			"account:engine-state",
			"claude",
			engineState({ occurredAt: 5_007, exhausted: false }),
		);
		await emit(
			"account:engine-state",
			"claude",
			engineState({ occurredAt: 5_008, exhausted: true }),
		);
		expect(shown).toHaveLength(2);
	});

	test("a session that could not be moved names its workspace", async () => {
		await mountSubscriber("http://host-attention");

		await emit(
			"account:engine-state",
			"codex",
			engineState({
				occurredAt: 6_006,
				agent: "codex",
				needsAttention: {
					workspaceId: "workspace-1",
					terminalId: "terminal-9",
					reason: "resume-failed",
				},
			}),
		);

		expect(shown[0]).toMatchObject({
			title: "A Codex session needs attention",
			body: "Fix the login page",
		});
	});

	// The latches are module-level, so keying them by agent alone let the
	// first host that reported an episode silence every other host's.
	test("one host's exhaustion does not silence another host's", async () => {
		await mountSubscriber("http://host-two-exhausted-a");
		await mountSubscriber("http://host-two-exhausted-b");

		await emit(
			"account:engine-state",
			"claude",
			engineState({ occurredAt: 7_001, exhausted: true }),
			"http://host-two-exhausted-a",
		);
		await emit(
			"account:engine-state",
			"claude",
			engineState({ occurredAt: 7_002, exhausted: true }),
			"http://host-two-exhausted-b",
		);

		expect(shown).toHaveLength(2);
	});

	test("one host's stuck session does not silence another host's", async () => {
		await mountSubscriber("http://host-two-attention-a");
		await mountSubscriber("http://host-two-attention-b");
		const payload = engineState({
			occurredAt: 7_003,
			needsAttention: {
				workspaceId: "workspace-1",
				terminalId: "terminal-9",
				reason: "resume-failed",
			},
		});

		await emit(
			"account:engine-state",
			"claude",
			payload,
			"http://host-two-attention-a",
		);
		await emit(
			"account:engine-state",
			"claude",
			payload,
			"http://host-two-attention-b",
		);

		expect(shown).toHaveLength(2);
	});
});

describe("switch failures", () => {
	test("a failed automatic switch is told once, and again when it recurs", async () => {
		await mountSubscriber("http://host-switch-failure");
		const failure = { code: "verify-failed" as const, at: 8_000 };

		await emit(
			"account:engine-state",
			"claude",
			engineState({ occurredAt: 8_001, lastSwitchFailure: failure }),
		);
		// The same failure re-broadcast (a later state change) says nothing new.
		await emit(
			"account:engine-state",
			"claude",
			engineState({ occurredAt: 8_002, lastSwitchFailure: failure }),
		);

		expect(shown).toEqual([
			{
				silent: true,
				title: "Claude could not switch accounts",
				body: "Switch failed (verify-failed). The previous account is still active.",
			},
		]);

		await emit(
			"account:engine-state",
			"claude",
			engineState({
				occurredAt: 8_003,
				lastSwitchFailure: { code: "verify-failed", at: 8_500 },
			}),
		);
		expect(shown).toHaveLength(2);
	});

	test("two hosts reporting the same failure both notify", async () => {
		await mountSubscriber("http://host-two-failure-a");
		await mountSubscriber("http://host-two-failure-b");
		const payload = engineState({
			occurredAt: 8_600,
			lastSwitchFailure: { code: "verify-failed", at: 8_600 },
		});

		await emit(
			"account:engine-state",
			"claude",
			payload,
			"http://host-two-failure-a",
		);
		await emit(
			"account:engine-state",
			"claude",
			payload,
			"http://host-two-failure-b",
		);

		expect(shown).toHaveLength(2);
	});

	test("a code the renderer has wording for reads as that wording", async () => {
		await mountSubscriber("http://host-switch-failure-known");

		await emit(
			"account:engine-state",
			"codex",
			engineState({
				occurredAt: 9_001,
				agent: "codex",
				lastSwitchFailure: { code: "unsupported-platform", at: 9_000 },
			}),
		);

		expect(shown[0]).toMatchObject({
			title: "Codex could not switch accounts",
			body: "Automatic account switching is not available on Windows. Switch accounts by hand instead.",
		});
	});
});

function readWatermarks(): unknown {
	const raw = localStorage.getItem("superset.accountSwitch.lastSeenAt");
	return raw === null ? null : JSON.parse(raw);
}

describe("away summary", () => {
	test("summarises switches newer than the marker, once", async () => {
		historyEntries = [
			{ at: 500, agent: "claude", reasonKind: "threshold" },
			{ at: 600, agent: "codex", reasonKind: "strategy" },
			// A refused limit hint is not a switch.
			{ at: 700, agent: "claude", reasonKind: "fallback-rejected" },
		];

		await mountSubscriber("http://host-away-first");
		expect(toasts).toEqual(["2 account switches while you were away"]);

		// Remounting the same host does not summarise it twice.
		await mountSubscriber("http://host-away-first");
		expect(toasts).toHaveLength(1);
		expect(readWatermarks()).toEqual({ "http://host-away-first": 700 });
	});

	// The marker used to be one renderer-wide number, so the first host to
	// report swallowed every other host's summary.
	test("each host summarises against its own marker", async () => {
		historyEntries = [{ at: 1_500, agent: "claude", reasonKind: "threshold" }];

		await mountSubscriber("http://host-away-per-host-a");
		await mountSubscriber("http://host-away-per-host-b");

		expect(toasts).toEqual([
			"1 account switch while you were away",
			"1 account switch while you were away",
		]);
		expect(readWatermarks()).toEqual({
			"http://host-away-per-host-a": 1_500,
			"http://host-away-per-host-b": 1_500,
		});
	});

	// Profiles written before the marker became a map still hold a bare number.
	test("a legacy scalar marker is read as no marker, not a crash", async () => {
		localStorage.setItem("superset.accountSwitch.lastSeenAt", "9999999");
		historyEntries = [{ at: 1_600, agent: "claude", reasonKind: "threshold" }];

		await mountSubscriber("http://host-away-legacy");

		expect(toasts).toEqual(["1 account switch while you were away"]);
		expect(readWatermarks()).toEqual({ "http://host-away-legacy": 1_600 });
	});

	test("a single switch reads in the singular", async () => {
		historyEntries = [{ at: 900, agent: "claude", reasonKind: "threshold" }];

		await mountSubscriber("http://host-away-singular");

		expect(toasts).toEqual(["1 account switch while you were away"]);
	});

	test("a live switch marks itself seen so it is not summarised later", async () => {
		await mountSubscriber("http://host-away-live");
		await emit("account:switched", "claude", switched({ at: 10_010 }));

		expect(readWatermarks()).toEqual({ "http://host-away-live": 10_010 });
	});

	// The watermark is read before the history round trip, so a switch that
	// arrives during it used to be notified live and then counted again as one
	// the user had missed.
	test("a switch that lands during the load is not counted twice", async () => {
		let openGate = () => {};
		historyGate = new Promise<void>((resolve) => {
			openGate = resolve;
		});
		historyEntries = [
			{ at: 11_100, agent: "claude", reasonKind: "threshold" },
			{ at: 11_200, agent: "codex", reasonKind: "strategy" },
			// The live one below, as the host records it.
			{ at: 11_300, agent: "claude", reasonKind: "threshold" },
		];

		await mountSubscriber("http://host-away-race");
		expect(toasts).toEqual([]);

		await emit(
			"account:switched",
			"claude",
			switched({ at: 11_300 }),
			"http://host-away-race",
		);
		await act(async () => {
			openGate();
			await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(shown).toHaveLength(1);
		expect(toasts).toEqual(["2 account switches while you were away"]);
	});

	test("an unreachable host is left to try again, without a toast", async () => {
		historyError = new Error("connection refused");

		await mountSubscriber("http://host-away-offline");

		expect(toasts).toEqual([]);
	});

	test("the subscriber releases its bus retain on unmount", async () => {
		await mountSubscriber("http://host-retain");
		expect(busRetainCount).toBe(1);

		await act(async () => cleanup());
		expect(busRetainCount).toBe(0);
	});
});

describe("persisted state", () => {
	test("the last-seen marker is registered", async () => {
		const { PERSISTED_KEY_REGISTRY } = await import(
			"renderer/lib/persisted-keys/persisted-key-registry.test-data"
		);
		const entry = PERSISTED_KEY_REGISTRY.find(([file]) =>
			file.endsWith("AccountSwitchSubscriber/AccountSwitchSubscriber.tsx"),
		);

		expect(entry?.[1]).toEqual(["superset.accountSwitch.lastSeenAt"]);
	});
});
