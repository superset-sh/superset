import { expect, test } from "bun:test";
import {
	QueryClient,
	QueryObserver,
	type QueryObserverOptions,
} from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import {
	hostServiceQueryFn,
	hostServiceQueryRetry,
} from "./host-service-client";

const QUERY_KEY = ["host-service-client-test", "pull-requests"] as const;
const CACHED = { workspaces: [{ workspaceId: "ws-1", prNumber: 7767 }] };
const SETTLE_TIMEOUT_MS = 1000;

type Cached = typeof CACHED;
type Options = QueryObserverOptions<
	Cached,
	Error,
	Cached,
	Cached,
	typeof QUERY_KEY
>;
type Observer = QueryObserver<Cached, Error, Cached, Cached, typeof QUERY_KEY>;

function relayUnavailableError() {
	return TRPCClientError.from({
		error: {
			message: "Host is not online",
			code: -32603,
			data: { code: "SERVICE_UNAVAILABLE" },
		},
	});
}

async function drainMicrotasks() {
	for (let tick = 0; tick < 20; tick++) await Promise.resolve();
}

function waitUntilSettled(observer: Observer): Promise<void> {
	return new Promise((resolve, reject) => {
		let unsubscribe: (() => void) | undefined;
		let done = false;
		const finish = (fail?: Error) => {
			if (done) return;
			done = true;
			clearTimeout(timer);
			unsubscribe?.();
			if (fail) reject(fail);
			else resolve();
		};
		const timer = setTimeout(
			() => finish(new Error("the retry never settled")),
			SETTLE_TIMEOUT_MS,
		);
		unsubscribe = observer.subscribe(() => {
			if (!observer.getCurrentResult().isFetching) finish();
		});
		if (!observer.getCurrentResult().isFetching) finish();
	});
}

test("a retry in flight when the host URL goes null leaves the cache intact", async () => {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				networkMode: "always",
				retry: hostServiceQueryRetry,
				retryDelay: () => 0,
			},
		},
	});
	queryClient.setQueryData(QUERY_KEY, CACHED);

	let calls = 0;
	const query = async (): Promise<Cached> => {
		calls++;
		throw relayUnavailableError();
	};
	const options = (hostUrl: string | null): Options => ({
		queryKey: QUERY_KEY,
		staleTime: 0,
		queryFn: hostServiceQueryFn(hostUrl, query),
	});

	const observer: Observer = new QueryObserver(
		queryClient,
		options("http://127.0.0.1:1"),
	);
	const unsubscribe = observer.subscribe(() => {});

	await drainMicrotasks();
	expect(observer.getCurrentResult().failureCount).toBe(1);
	expect(observer.getCurrentResult().isFetching).toBe(true);

	observer.setOptions(options(null));

	await waitUntilSettled(observer);

	expect(calls).toBe(1);
	expect(observer.getCurrentResult().isFetching).toBe(false);
	expect(observer.getCurrentResult().isError).toBe(true);
	expect(queryClient.getQueryData<Cached>(QUERY_KEY)).toEqual(CACHED);
	expect(observer.getCurrentResult().data).toEqual(CACHED);

	unsubscribe();
	queryClient.clear();
});
