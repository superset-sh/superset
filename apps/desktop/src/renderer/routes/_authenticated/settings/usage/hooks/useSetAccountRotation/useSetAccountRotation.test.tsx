import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let refuse = false;
// The call for `holdKey` stays in flight until `releaseHeld()`, so a second
// toggle can still be pending while the first one is answered.
let holdKey: string | null = null;
let releaseHeld: (() => void) | undefined;
// The fake host's own state. A toggle lands in it when that call resolves, so
// a quota read taken while a toggle is in flight still answers with the flag
// the user has already flipped on screen.
let serverRotation: Record<string, boolean> = {};
const setRotation = mock(
	(input: { accountKey: string; inRotation: boolean }) => {
		const land = () => {
			serverRotation[input.accountKey] = input.inRotation;
			return { rotation: { ...serverRotation } };
		};
		if (input.accountKey === holdKey) {
			return new Promise<{ rotation: Record<string, boolean> }>((resolve) => {
				releaseHeld = () => resolve(land());
			});
		}
		return refuse
			? Promise.reject(new Error("lock-loser"))
			: Promise.resolve(land());
	},
);
const quotaQuery = mock(() =>
	Promise.resolve(
		seededAccounts().map((account) => ({
			...account,
			inRotation:
				serverRotation[`${account.agent}:${account.accountId}`] ??
				account.inRotation,
		})),
	),
);
// Spread the real module: `mock.module` is process-wide, so a partial stub
// would strip the other exports from every suite in the same run.
// Snapshot into a plain object: `mock.module` rewrites the live namespace in
// place, so spreading the namespace itself in `afterAll` would restore the stub.
const realHostServiceClient = {
	...(await import("renderer/lib/host-service-client")),
};
mock.module("renderer/lib/host-service-client", () => ({
	...realHostServiceClient,
	getHostServiceClientByUrl: () => ({
		usage: {
			engine: { setRotation: { mutate: setRotation } },
			quota: { query: quotaQuery },
		},
	}),
}));

const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { act, cleanup, renderHook, waitFor } = await import(
	"@testing-library/react"
);
const { useSetAccountRotation } = await import("./useSetAccountRotation");
const { HOST_USAGE_QUOTA_QUERY_KEY, useHostUsageQuota } = await import(
	"../useHostUsageQuota"
);

afterEach(cleanup);
afterAll(async () => {
	// `mock.module` is process-wide and `mock.restore` does not undo it, so the
	// real module goes back before the next suite in this run asks for a client.
	mock.module("renderer/lib/host-service-client", () => ({
		...realHostServiceClient,
	}));
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const HOST = "http://127.0.0.1:7777";
const QUOTA_KEY = [...HOST_USAGE_QUOTA_QUERY_KEY, HOST];

function seededAccounts() {
	return [
		{
			agent: "claude",
			accountId: "uuid-a",
			selection: "/p/a",
			inRotation: true,
		},
		{
			agent: "claude",
			accountId: "uuid-b",
			selection: "/p/b",
			inRotation: true,
		},
	];
}

function setup() {
	const queryClient = new QueryClient({
		defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
	});
	queryClient.setQueryData(QUOTA_KEY, seededAccounts());
	const view = renderHook(() => useSetAccountRotation(HOST), {
		wrapper: ({ children }: { children: React.ReactNode }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		),
	});
	const rotationOf = (accountId: string) =>
		(
			queryClient.getQueryData(QUOTA_KEY) as Array<{
				accountId: string;
				inRotation: boolean;
			}>
		).find((account) => account.accountId === accountId)?.inRotation;
	return { view, rotationOf };
}

/**
 * Same, with the Usage page's quota query mounted alongside the toggle: an
 * invalidate only refetches a query something is watching, so the concurrent
 * case needs a real observer to reproduce at all.
 */
function setupWithQuotaWatcher() {
	const queryClient = new QueryClient({
		defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
	});
	queryClient.setQueryData(QUOTA_KEY, seededAccounts());
	serverRotation = {};
	setRotation.mockClear();
	quotaQuery.mockClear();
	const view = renderHook(
		() => {
			useHostUsageQuota(HOST);
			return useSetAccountRotation(HOST);
		},
		{
			wrapper: ({ children }: { children: React.ReactNode }) => (
				<QueryClientProvider client={queryClient}>
					{children}
				</QueryClientProvider>
			),
		},
	);
	const rotationOf = (accountId: string) =>
		(
			queryClient.getQueryData(QUOTA_KEY) as Array<{
				accountId: string;
				inRotation: boolean;
			}>
		).find((account) => account.accountId === accountId)?.inRotation;
	// Let anything the settle path started reach the cache before asserting the
	// switch stayed put — a refetch it fired would land within a few turns.
	const settleTurns = async () => {
		for (let turn = 0; turn < 5; turn++) {
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 0));
			});
		}
	};
	return { view, rotationOf, settleTurns };
}

describe("useSetAccountRotation", () => {
	test("flips the account before the host answers, and only that account", async () => {
		refuse = false;
		const { view, rotationOf } = setup();
		await act(async () => {
			view.result.current.mutate({
				accountKey: "claude:uuid-a",
				inRotation: false,
			});
		});
		expect(rotationOf("uuid-a")).toBe(false);
		expect(rotationOf("uuid-b")).toBe(true);
		// Assert on what the hook owns — the host call and the cache — rather
		// than on a re-render, which another suite's DOM teardown can swallow
		// when several renderer test files share one process.
		await waitFor(() =>
			expect(setRotation).toHaveBeenCalledWith({
				accountKey: "claude:uuid-a",
				inRotation: false,
			}),
		);
		await waitFor(() => expect(rotationOf("uuid-a")).toBe(false));
	});

	test("puts the toggle back when the host refuses", async () => {
		refuse = true;
		const { view, rotationOf } = setup();
		await act(async () => {
			view.result.current.mutate({
				accountKey: "claude:uuid-a",
				inRotation: false,
			});
		});
		await waitFor(() => expect(setRotation).toHaveBeenCalled());
		// The refusal rolls the optimistic flip back in the query cache.
		await waitFor(() => expect(rotationOf("uuid-a")).toBe(true));
	});

	test("a refusal puts back only its own account, not one toggled meanwhile", async () => {
		refuse = true;
		holdKey = "claude:uuid-b";
		const { view, rotationOf } = setup();
		await act(async () => {
			view.result.current.mutate({
				accountKey: "claude:uuid-a",
				inRotation: false,
			});
			view.result.current.mutate({
				accountKey: "claude:uuid-b",
				inRotation: false,
			});
		});
		// A is refused while B is still in flight: A goes back, B keeps what the
		// user set rather than springing back with the whole snapshot.
		await waitFor(() => expect(rotationOf("uuid-a")).toBe(true));
		expect(rotationOf("uuid-b")).toBe(false);
		await act(async () => {
			releaseHeld?.();
		});
		await waitFor(() => expect(rotationOf("uuid-b")).toBe(false));
		holdKey = null;
	});

	test("a settled toggle does not refetch a switch still in flight back on", async () => {
		refuse = false;
		holdKey = "claude:uuid-b";
		const { rotationOf, settleTurns, view } = setupWithQuotaWatcher();
		await act(async () => {
			view.result.current.mutate({
				accountKey: "claude:uuid-a",
				inRotation: false,
			});
			view.result.current.mutate({
				accountKey: "claude:uuid-b",
				inRotation: false,
			});
		});
		await waitFor(() => expect(setRotation).toHaveBeenCalledTimes(2));
		// A has landed on the host, B has not: reading the host now would report
		// B still in rotation, so nothing may read it until B answers.
		await settleTurns();
		expect(rotationOf("uuid-b")).toBe(false);
		expect(rotationOf("uuid-a")).toBe(false);
		expect(quotaQuery).not.toHaveBeenCalled();
		await act(async () => {
			releaseHeld?.();
		});
		// The last toggle to settle reads the host once, and it now agrees.
		await waitFor(() => expect(quotaQuery).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(rotationOf("uuid-b")).toBe(false));
		expect(rotationOf("uuid-a")).toBe(false);
		holdKey = null;
	});
});
