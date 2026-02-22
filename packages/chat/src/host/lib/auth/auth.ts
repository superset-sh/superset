import type { AppRouter } from "@superset/trpc";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";

type MaybePromise<T> = T | Promise<T>;

export interface ChatHostAuthProvider {
	getHeaders: () => MaybePromise<Record<string, string>>;
	onUnauthorized?: () => MaybePromise<"retry" | "fail">;
}

function mergeHeaders(
	requestHeaders: HeadersInit | undefined,
	authHeaders: Record<string, string>,
): Headers {
	const headers = new Headers(requestHeaders);
	for (const [key, value] of Object.entries(authHeaders)) {
		headers.set(key, value);
	}
	return headers;
}

/**
 * Thin fetch wrapper that injects auth headers for each request.
 * If the request returns 401 and `onUnauthorized` is provided, it can request
 * one retry after refreshing/rotating credentials.
 */
export async function authFetch(
	authProvider: ChatHostAuthProvider,
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	const headers = await authProvider.getHeaders();
	const request = {
		...init,
		headers: mergeHeaders(init?.headers, headers),
	};

	const response = await fetch(input, request);
	if (response.status !== 401 || !authProvider.onUnauthorized) {
		return response;
	}

	const decision = await authProvider.onUnauthorized();
	if (decision !== "retry") {
		return response;
	}

	const retryHeaders = await authProvider.getHeaders();
	return fetch(input, {
		...init,
		headers: mergeHeaders(init?.headers, retryHeaders),
	});
}

export function createApiTrpcClient(options: {
	apiUrl: string;
	authProvider: ChatHostAuthProvider;
}) {
	return createTRPCProxyClient<AppRouter>({
		links: [
			httpBatchLink({
				url: `${options.apiUrl}/api/trpc`,
				transformer: superjson,
				fetch: (input, init) => authFetch(options.authProvider, input, init),
			}),
		],
	});
}
