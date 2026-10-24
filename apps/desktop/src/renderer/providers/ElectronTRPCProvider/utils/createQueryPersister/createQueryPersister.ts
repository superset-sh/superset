import type {
	PersistedClient,
	Persister,
} from "@tanstack/react-query-persist-client";
import superjson from "superjson";

interface QueryStorage {
	getItem: (key: string) => Promise<string | null>;
	setItem: (key: string, value: string) => Promise<void>;
	removeItem: (key: string) => Promise<void>;
}

export function createQueryPersister(storage: QueryStorage): Persister {
	const key = "superset-rq-cache";
	return {
		persistClient: (client) =>
			storage.setItem(key, superjson.stringify(client)),
		restoreClient: async () => {
			const cached = await storage.getItem(key);
			return cached ? superjson.parse<PersistedClient>(cached) : undefined;
		},
		removeClient: () => storage.removeItem(key),
	};
}
