import type { QueryClient } from "@tanstack/react-query";

const requests = new WeakMap<QueryClient, Map<string | null, symbol>>();

export async function refreshUsageQuota<T>({
	queryClient,
	queryKey,
	load,
}: {
	queryClient: QueryClient;
	queryKey: readonly ["host-usage-quota", string | null];
	load: () => Promise<T>;
}): Promise<void> {
	let pending = requests.get(queryClient);
	if (!pending) {
		pending = new Map();
		requests.set(queryClient, pending);
	}
	const host = queryKey[1];
	const request = Symbol();
	pending.set(host, request);
	try {
		const fresh = await load();
		if (pending.get(host) !== request) return;
		await queryClient.cancelQueries({ queryKey, exact: true });
		if (pending.get(host) !== request) return;
		queryClient.setQueryData(queryKey, fresh);
	} finally {
		if (pending.get(host) === request) pending.delete(host);
	}
}
