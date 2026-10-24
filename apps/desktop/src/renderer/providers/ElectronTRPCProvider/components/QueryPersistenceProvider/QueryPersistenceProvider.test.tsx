import { afterAll, afterEach, expect, mock, spyOn, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
	dehydrate,
	QueryClient,
	useIsRestoring,
	useQuery,
} from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { StrictMode } from "react";
import { QueryPersistenceProvider } from "./QueryPersistenceProvider";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
const { act, cleanup, renderHook } = await import("@testing-library/react");

afterEach(() => {
	cleanup();
	mock.restore();
});

afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function createClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { gcTime: Infinity, staleTime: Infinity, retry: false },
		},
	});
}

function createSnapshot(
	buster = "v2",
	timestamp = Date.now(),
): PersistedClient {
	const source = createClient();
	source.setQueryData(["dashboard-sidebar", "workspace"], "cached");
	return { buster, timestamp, clientState: dehydrate(source) };
}

test("restoration gates fetching and hydrates the existing cache in StrictMode", async () => {
	const client = createClient();
	const restore = Promise.withResolvers<PersistedClient>();
	const queryFn = mock(async () => "network");
	const persister = {
		restoreClient: mock(() => restore.promise),
		persistClient: mock(() => {}),
		removeClient: mock(() => {}),
	};
	const persistOptions = { persister, buster: "v2" };
	const { result } = renderHook(
		() => ({
			restoring: useIsRestoring(),
			query: useQuery({
				queryKey: ["dashboard-sidebar", "workspace"],
				queryFn,
			}),
		}),
		{
			wrapper: ({ children }) => (
				<StrictMode>
					<QueryPersistenceProvider
						client={client}
						persistOptions={persistOptions}
					>
						{children}
					</QueryPersistenceProvider>
				</StrictMode>
			),
		},
	);
	expect(result.current.restoring).toBe(true);
	expect(queryFn).not.toHaveBeenCalled();
	await act(async () => restore.resolve(createSnapshot()));
	expect(result.current.restoring).toBe(false);
	expect(result.current.query.data).toBe("cached");
	expect(queryFn).not.toHaveBeenCalled();
	expect(persister.restoreClient).toHaveBeenCalledTimes(1);
	expect(persister.persistClient).not.toHaveBeenCalled();
	await act(async () => {
		client.setQueryData(["dashboard-sidebar", "workspace"], "updated");
		window.dispatchEvent(new Event("blur"));
	});
	expect(persister.persistClient).toHaveBeenCalledTimes(1);
});

test.each([
	["expired", "v2", 0],
	["incompatible", "v1", Date.now()],
] as const)("%s snapshots are removed before fetching", async (_, buster, timestamp) => {
	const client = createClient();
	const queryFn = mock(async () => "network");
	const persister = {
		restoreClient: () => createSnapshot(buster, timestamp),
		persistClient: () => {},
		removeClient: mock(() => {}),
	};
	const persistOptions = { persister, buster: "v2", maxAge: 86_400_000 };
	const { result } = renderHook(
		() => useQuery({ queryKey: ["dashboard-sidebar", "workspace"], queryFn }),
		{
			wrapper: ({ children }) => (
				<QueryPersistenceProvider
					client={client}
					persistOptions={persistOptions}
				>
					{children}
				</QueryPersistenceProvider>
			),
		},
	);
	await act(async () => {});
	expect(persister.removeClient).toHaveBeenCalledTimes(1);
	expect(queryFn).toHaveBeenCalledTimes(1);
	expect(client.getQueryData<string>(["dashboard-sidebar", "workspace"])).toBe(
		"network",
	);
	expect(result.current.data).not.toBe("cached");
});

test("a restore rejection is logged and releases the fetch gate", async () => {
	spyOn(console, "error").mockImplementation(() => {});
	const warn = spyOn(console, "warn").mockImplementation(() => {});
	const error = new Error("cache removal unavailable");
	const client = createClient();
	const queryFn = mock(async () => "network");
	const persistOptions = {
		persister: {
			restoreClient: async () => {
				throw new Error("invalid cache");
			},
			persistClient: () => {},
			removeClient: mock(async () => {
				throw error;
			}),
		},
	};
	const { result } = renderHook(
		() => {
			useQuery({ queryKey: ["workspace"], queryFn });
			return useIsRestoring();
		},
		{
			wrapper: ({ children }) => (
				<QueryPersistenceProvider
					client={client}
					persistOptions={persistOptions}
				>
					{children}
				</QueryPersistenceProvider>
			),
		},
	);
	await act(async () => {});
	expect(result.current).toBe(false);
	expect(queryFn).toHaveBeenCalledTimes(1);
	expect(persistOptions.persister.removeClient).toHaveBeenCalledTimes(1);
	expect(warn).toHaveBeenCalledWith(
		"[query-persistence] Failed to restore cache",
		error,
	);
});
