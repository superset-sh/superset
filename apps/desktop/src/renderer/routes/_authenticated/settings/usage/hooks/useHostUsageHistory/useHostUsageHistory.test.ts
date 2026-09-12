import { afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { hostUsageHistoryOptions } from "./useHostUsageHistory";

const clients: QueryClient[] = [];
afterEach(() => {
	for (const client of clients) client.clear();
	clients.length = 0;
});
function setup() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 5 * 60_000 } },
	});
	clients.push(client);
	return client;
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

test("retains stale history across remounts and a failed background scan", async () => {
	const client = setup();
	const options = hostUsageHistoryOptions("http://host-a", 30);
	client.setQueryData(options.queryKey, previous, { updatedAt: 1 });
	const request = mock(async () => {
		throw new Error("offline");
	});
	const first = new QueryObserver(client, { ...options, queryFn: request });
	const unsubscribe = first.subscribe(() => {});
	expect(first.getCurrentResult().data).toEqual(previous);
	expect(first.getCurrentResult().isFetching).toBe(true);
	await first.refetch();
	unsubscribe();
	expect(
		client.getQueryCache().find({ queryKey: options.queryKey })?.gcTime,
	).toBe(24 * 60 * 60_000);
	const next = new QueryObserver(client, { ...options, queryFn: request });
	const stop = next.subscribe(() => {});
	expect(next.getCurrentResult().data).toEqual(previous);
	await next.refetch();
	expect(next.getCurrentResult().isError).toBe(true);
	expect(next.getCurrentResult().data).toEqual(previous);
	stop();
});

test("a completed background scan replaces cached results", async () => {
	const client = setup();
	const options = hostUsageHistoryOptions("http://host-a", 30);
	client.setQueryData(options.queryKey, previous, { updatedAt: 1 });
	const fresh = { ...previous, totals: { ...previous.totals, tokens: 456 } };
	const observer = new QueryObserver(client, {
		...options,
		queryFn: async () => fresh,
	});
	const stop = observer.subscribe(() => {});
	expect(observer.getCurrentResult().data).toEqual(previous);
	await observer.refetch();
	expect(observer.getCurrentResult().data).toEqual(fresh);
	stop();
});

test("range switches reuse this host's data, never another host's", () => {
	const client = setup();
	client.setQueryData(
		hostUsageHistoryOptions("http://host-a", 30).queryKey,
		previous,
	);
	const observer = new QueryObserver(client, {
		...hostUsageHistoryOptions("http://host-a", 30),
		enabled: false,
	});
	const stop = observer.subscribe(() => {});
	observer.setOptions({
		...hostUsageHistoryOptions("http://host-a", 7),
		enabled: false,
	});
	expect(observer.getCurrentResult().data).toEqual(previous);
	expect(observer.getCurrentResult().isPlaceholderData).toBe(true);
	observer.setOptions({
		...hostUsageHistoryOptions("http://host-b", 7),
		enabled: false,
	});
	expect(observer.getCurrentResult().data).toBeUndefined();
	stop();
});
