import {
	defaultShouldDehydrateQuery,
	QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

export const createQueryClient = () =>
	new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 30 * 1000,
			},
			dehydrate: {
				serializeData: SuperJSON.serialize,
				shouldDehydrateQuery: (query) =>
					defaultShouldDehydrateQuery(query) ||
					query.state.status === "pending",
				shouldRedactErrors: () => false,
			},
			hydrate: {
				deserializeData: SuperJSON.deserialize,
			},
		},
	});
