import {
	IsRestoringProvider,
	QueryClientProvider,
	type QueryClientProviderProps,
} from "@tanstack/react-query";
import {
	type PersistQueryClientOptions,
	persistQueryClientRestore,
} from "@tanstack/react-query-persist-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeToQueryPersistence } from "./utils/subscribeToQueryPersistence";

type QueryPersistenceProviderProps = QueryClientProviderProps & {
	persistOptions: Omit<PersistQueryClientOptions, "queryClient">;
};

export function QueryPersistenceProvider({
	client,
	persistOptions,
	children,
}: QueryPersistenceProviderProps) {
	const [isRestoring, setIsRestoring] = useState(true);
	const didRestore = useRef(false);
	const options = useMemo(
		() => ({ ...persistOptions, queryClient: client }),
		[client, persistOptions],
	);

	useEffect(() => {
		if (!didRestore.current) {
			didRestore.current = true;
			void persistQueryClientRestore(options)
				.catch((error) => {
					console.warn("[query-persistence] Failed to restore cache", error);
				})
				.finally(() => setIsRestoring(false));
		}
		if (!isRestoring) return subscribeToQueryPersistence(options);
	}, [isRestoring, options]);

	return (
		<QueryClientProvider client={client}>
			<IsRestoringProvider value={isRestoring}>{children}</IsRestoringProvider>
		</QueryClientProvider>
	);
}
