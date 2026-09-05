import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let refuse = false;
const setRotation = mock(() =>
	refuse
		? Promise.reject(new Error("lock-loser"))
		: Promise.resolve({ rotation: { "claude:uuid-a": false } }),
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
		usage: { engine: { setRotation: { mutate: setRotation } } },
	}),
}));

const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { act, cleanup, renderHook, waitFor } = await import(
	"@testing-library/react"
);
const { useSetAccountRotation } = await import("./useSetAccountRotation");
const { HOST_USAGE_QUOTA_QUERY_KEY } = await import("../useHostUsageQuota");

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
});
