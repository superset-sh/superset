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

const busListeners = new Map<string, Set<BusListener>>();
let busRetainCount = 0;

// Spread the real modules: `mock.module` is process-wide, so a partial stub
// would strip the other exports from every suite in the same run.
const realHostEventBus = await import("renderer/lib/host-event-bus");
const realTrpcClient = await import("renderer/lib/trpc-client");
const realSonner = await import("@superset/ui/sonner");

mock.module("renderer/lib/host-event-bus", () => ({
	...realHostEventBus,
	getHostEventBus: () => ({
		on: (type: string, _scope: string, callback: BusListener) => {
			const listeners = busListeners.get(type) ?? new Set<BusListener>();
			listeners.add(callback);
			busListeners.set(type, listeners);
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

const loadHistory = async () => {
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
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

beforeEach(() => {
	shown.length = 0;
	toasts.length = 0;
	busListeners.clear();
	historyEntries = [];
	historyError = null;
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

async function emit(type: string, scope: string, payload: unknown) {
	await act(async () => {
		for (const listener of busListeners.get(type) ?? []) {
			listener(scope, payload);
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
});

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

		// The marker moved past every entry, so a second host that reports the
		// same history says nothing.
		await mountSubscriber("http://host-away-second");
		expect(toasts).toHaveLength(1);
		expect(localStorage.getItem("superset.accountSwitch.lastSeenAt")).toBe(
			"700",
		);
	});

	test("a single switch reads in the singular", async () => {
		historyEntries = [{ at: 900, agent: "claude", reasonKind: "threshold" }];

		await mountSubscriber("http://host-away-singular");

		expect(toasts).toEqual(["1 account switch while you were away"]);
	});

	test("a live switch marks itself seen so it is not summarised later", async () => {
		await mountSubscriber("http://host-away-live");
		await emit("account:switched", "claude", switched({ at: 10_010 }));

		expect(localStorage.getItem("superset.accountSwitch.lastSeenAt")).toBe(
			"10010",
		);
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
