import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, renderHook, waitFor, act } = await import(
	"@testing-library/react"
);
const React = await import("react");
const historyRequest = mock((): Promise<unknown> => new Promise(() => {}));
mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: () => ({
		usage: { history: { query: historyRequest } },
	}),
}));
const { useHostUsageHistory } = await import("./useHostUsageHistory");
const clients: QueryClient[] = [];
afterEach(() => {
	cleanup();
	for (const client of clients) client.clear();
	clients.length = 0;
	historyRequest.mockReset();
});
afterAll(async () => {
	mock.restore();
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function setup() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 5 * 60_000 } },
	});
	clients.push(client);
	const wrapper = ({ children }: { children: ReactNode }) =>
		React.createElement(QueryClientProvider, { client }, children);
	return { client, wrapper };
}

const previous = {
	days: 30,
	buckets: [],
	models: [],
	projects: [],
	projectDetails: {},
	modelDetails: {},
	scannedFiles: 1,
	pricingTableUpdated: "2026-09-10",
	totals: {
		tokens: 123,
		usd: 4,
		uncachedInput: 123,
		cachedInput: 0,
		cacheWrite: 0,
		output: 0,
		reasoningOutput: 0,
		cacheSavingsUsd: 0,
		approximate: false,
	},
};

test("returning to stale history keeps results visible during a scan and after failure", async () => {
	const { client, wrapper } = setup();
	const key = ["host-usage-history", "http://host-a", 30];
	client.setQueryData(key, previous, { updatedAt: Date.now() - 10 * 60_000 });
	let rejectScan!: (error: Error) => void;
	historyRequest.mockImplementation(
		() =>
			new Promise((_, reject) => {
				rejectScan = reject;
			}),
	);
	const first = renderHook(() => useHostUsageHistory("http://host-a", 30), {
		wrapper,
	});
	expect(first.result.current.data).toEqual(previous);
	expect(first.result.current.isFetching).toBe(true);
	first.unmount();
	// The inactive entry must outlive the former five-minute eviction window.
	expect(client.getQueryCache().find({ queryKey: key })?.gcTime).toBe(
		24 * 60 * 60_000,
	);
	const next = renderHook(() => useHostUsageHistory("http://host-a", 30), {
		wrapper,
	});
	expect(next.result.current.data).toEqual(previous);
	expect(next.result.current.isError).toBe(false);
	await act(async () => rejectScan(new Error("host temporarily unavailable")));
	await waitFor(() => expect(next.result.current.isError).toBe(true));
	expect(next.result.current.data).toEqual(previous);
});

test("a completed background scan replaces the cached result", async () => {
	const { client, wrapper } = setup();
	client.setQueryData(["host-usage-history", "http://host-a", 30], previous, {
		updatedAt: 1,
	});
	const fresh = {
		...previous,
		totals: { ...previous.totals, tokens: 456, usd: 8 },
	};
	historyRequest.mockResolvedValue(fresh);
	const { result } = renderHook(
		() => useHostUsageHistory("http://host-a", 30),
		{ wrapper },
	);
	expect(result.current.data).toEqual(previous);
	await waitFor(() => expect(result.current.data).toEqual(fresh));
});

test("range switches keep this host's chart but host switches do not", async () => {
	const { client, wrapper } = setup();
	client.setQueryData(["host-usage-history", "http://host-a", 30], previous);
	historyRequest.mockImplementation(() => new Promise(() => {}));
	const { result, rerender } = renderHook(
		({ host, days }) => useHostUsageHistory(host, days),
		{
			wrapper,
			initialProps: { host: "http://host-a", days: 30 },
		},
	);
	rerender({ host: "http://host-a", days: 7 });
	expect(result.current.data).toEqual(previous);
	expect(result.current.isPlaceholderData).toBe(true);
	rerender({ host: "http://host-b", days: 7 });
	expect(result.current.data).toBeUndefined();
});
