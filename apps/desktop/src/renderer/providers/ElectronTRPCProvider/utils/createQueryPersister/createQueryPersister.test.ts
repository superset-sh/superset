import { expect, mock, test } from "bun:test";
import { dehydrate, QueryClient } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import superjson from "superjson";
import { createQueryPersister } from "./createQueryPersister";

test("existing cache snapshots retain Dates and use the same storage key", async () => {
	const client = new QueryClient();
	const date = new Date("2026-10-05T00:00:00Z");
	client.setQueryData(["tasks"], { date });
	const snapshot: PersistedClient = {
		timestamp: 1,
		buster: "v2",
		clientState: dehydrate(client),
	};
	let cached: string | null = superjson.stringify(snapshot);
	const storage = {
		getItem: mock(async () => cached),
		setItem: mock(async (_key: string, value: string) => {
			cached = value;
		}),
		removeItem: mock(async () => {
			cached = null;
		}),
	};
	const persister = createQueryPersister(storage);
	expect(await persister.restoreClient()).toEqual(snapshot);
	await persister.persistClient(snapshot);
	expect(storage.setItem).toHaveBeenCalledWith(
		"superset-rq-cache",
		superjson.stringify(snapshot),
	);
	expect(await persister.restoreClient()).toEqual(snapshot);
	await persister.removeClient();
	expect(storage.removeItem).toHaveBeenCalledWith("superset-rq-cache");
	expect(await persister.restoreClient()).toBeUndefined();
});

test("write failures reach the persistence scheduler", async () => {
	const failure = new Error("storage unavailable");
	const persister = createQueryPersister({
		getItem: async () => null,
		setItem: async () => {
			throw failure;
		},
		removeItem: async () => {},
	});
	await expect(
		persister.persistClient({
			timestamp: 1,
			buster: "v2",
			clientState: { queries: [], mutations: [] },
		}),
	).rejects.toBe(failure);
});
