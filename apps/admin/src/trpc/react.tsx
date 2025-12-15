"use client";

import { useAuth } from "@clerk/nextjs";
import type { AppRouter } from "@superset/trpc";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
	createTRPCClient,
	httpBatchStreamLink,
	loggerLink,
} from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { useRef, useState } from "react";
import SuperJSON from "superjson";

import { env } from "../env";
import { createQueryClient } from "./query-client";

let clientQueryClientSingleton: QueryClient | undefined;
const getQueryClient = () => {
	if (typeof window === "undefined") {
		return createQueryClient();
	}
	if (!clientQueryClientSingleton) {
		clientQueryClientSingleton = createQueryClient();
	}
	return clientQueryClientSingleton;
};

const context = createTRPCContext<AppRouter>();
export const { useTRPC, TRPCProvider } = context;
export type UseTRPC = typeof useTRPC;

export function TRPCReactProvider(props: { children: React.ReactNode }) {
	const queryClient = getQueryClient();
	const { getToken } = useAuth();
	const getTokenRef = useRef(getToken);
	getTokenRef.current = getToken;

	const [trpcClient] = useState(() =>
		createTRPCClient<AppRouter>({
			links: [
				loggerLink({
					enabled: (op) =>
						env.NODE_ENV === "development" ||
						(op.direction === "down" && op.result instanceof Error),
				}),
				httpBatchStreamLink({
					transformer: SuperJSON,
					url: `${env.NEXT_PUBLIC_API_URL}/api/trpc`,
					async headers() {
						const token = await getTokenRef.current();
						return {
							"x-trpc-source": "nextjs-react",
							...(token && { Authorization: `Bearer ${token}` }),
						};
					},
					fetch(url, options) {
						return fetch(url, {
							...options,
							credentials: "include",
						});
					},
				}),
			],
		}),
	);

	return (
		<QueryClientProvider client={queryClient}>
			<TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
				{props.children}
			</TRPCProvider>
		</QueryClientProvider>
	);
}
