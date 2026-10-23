import { afterEach, expect, test } from "bun:test";
import { isCancelledError, QueryClient } from "@tanstack/react-query";
import { refreshUsageQuota } from "./refreshUsageQuota";

const clients: QueryClient[] = [];
afterEach(() => {
	for (const client of clients.splice(0)) client.clear();
});

function client() {
	const result = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: Infinity } },
	});
	clients.push(result);
	return result;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: Error) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

const queryKey = ["host-usage-quota", "http://host-a"] as const;
const accountA = [{ accountKey: "same-profile", email: "a@example.test" }];
const accountB = [{ accountKey: "same-profile", email: "b@example.test" }];

test("a slow normal query cannot overwrite a successful sign-in refresh", async () => {
	const queryClient = client();
	const older = deferred<typeof accountA>();
	const normalQuery = queryClient
		.fetchQuery({ queryKey, queryFn: () => older.promise })
		.catch((error: unknown) => error);
	await refreshUsageQuota({
		queryClient,
		queryKey,
		load: async () => accountB,
	});
	expect(isCancelledError(await normalQuery)).toBe(true);
	older.resolve(accountA);
	await older.promise;
	expect(queryClient.getQueryData<typeof accountA>(queryKey)).toEqual(accountB);
});

test("only the newest forced refresh can publish across callers", async () => {
	const queryClient = client();
	const older = deferred<typeof accountA>();
	const first = refreshUsageQuota({
		queryClient,
		queryKey,
		load: () => older.promise,
	});
	await refreshUsageQuota({
		queryClient,
		queryKey: [...queryKey],
		load: async () => accountB,
	});
	older.resolve(accountA);
	await first;
	expect(queryClient.getQueryData<typeof accountA>(queryKey)).toEqual(accountB);
});

test("a newer refresh blocks an older result while cancellation is pending", async () => {
	const queryClient = client();
	const cancellationStarted = deferred<void>();
	const releaseCancellation = deferred<void>();
	const cancelQueries = queryClient.cancelQueries.bind(queryClient);
	let firstCancellation = true;
	queryClient.cancelQueries = async (...args) => {
		if (firstCancellation) {
			firstCancellation = false;
			cancellationStarted.resolve();
			await releaseCancellation.promise;
		}
		return cancelQueries(...args);
	};
	const older = refreshUsageQuota({
		queryClient,
		queryKey,
		load: async () => accountA,
	});
	await cancellationStarted.promise;
	const response = deferred<typeof accountB>();
	const newer = refreshUsageQuota({
		queryClient,
		queryKey,
		load: () => response.promise,
	});
	releaseCancellation.resolve();
	await older;
	const whileNewerIsPending = queryClient.getQueryData(queryKey);
	response.resolve(accountB);
	await newer;
	expect(whileNewerIsPending).toBeUndefined();
	expect(queryClient.getQueryData<typeof accountB>(queryKey)).toEqual(accountB);
});

test("a failed newer refresh preserves saved data and blocks older results", async () => {
	const queryClient = client();
	queryClient.setQueryData(queryKey, accountB);
	const older = deferred<typeof accountA>();
	const first = refreshUsageQuota({
		queryClient,
		queryKey,
		load: () => older.promise,
	});
	await expect(
		refreshUsageQuota({
			queryClient,
			queryKey,
			load: async () => {
				throw new Error("offline");
			},
		}),
	).rejects.toThrow("offline");
	older.resolve(accountA);
	await first;
	expect(queryClient.getQueryData<typeof accountA>(queryKey)).toEqual(accountB);
	await refreshUsageQuota({
		queryClient,
		queryKey,
		load: async () => accountA,
	});
	expect(queryClient.getQueryData<typeof accountA>(queryKey)).toEqual(accountA);
});

test("refreshes remain independent between hosts and query clients", async () => {
	const queryClient = client();
	const otherClient = client();
	const otherHost = ["host-usage-quota", "http://host-b"] as const;
	const older = deferred<typeof accountA>();
	const first = refreshUsageQuota({
		queryClient,
		queryKey,
		load: () => older.promise,
	});
	await Promise.all([
		refreshUsageQuota({
			queryClient,
			queryKey: otherHost,
			load: async () => accountB,
		}),
		refreshUsageQuota({
			queryClient: otherClient,
			queryKey,
			load: async () => accountB,
		}),
	]);
	older.resolve(accountA);
	await first;
	expect(queryClient.getQueryData<typeof accountA>(queryKey)).toEqual(accountA);
	expect(queryClient.getQueryData<typeof accountA>(otherHost)).toEqual(
		accountB,
	);
	expect(otherClient.getQueryData<typeof accountA>(queryKey)).toEqual(accountB);
});

test("publishing cancels only the exact quota query", async () => {
	const queryClient = client();
	const siblingKey = [...queryKey, "other-query"] as const;
	const pendingSibling = deferred<string>();
	const sibling = queryClient.fetchQuery({
		queryKey: siblingKey,
		queryFn: () => pendingSibling.promise,
	});
	await refreshUsageQuota({
		queryClient,
		queryKey,
		load: async () => accountB,
	});
	pendingSibling.resolve("retained");
	expect(await sibling).toBe("retained");
	expect(queryClient.getQueryData<string>(siblingKey)).toBe("retained");
});
