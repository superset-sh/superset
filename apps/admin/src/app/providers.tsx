"use client";

import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

import { PostHogUserIdentifier } from "@/components/PostHogUserIdentifier";

import { TRPCReactProvider } from "../trpc/react";

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<PostHogProvider client={posthog}>
			<TRPCReactProvider>
				<PostHogUserIdentifier />
				{children}
				<ReactQueryDevtools initialIsOpen={false} />
			</TRPCReactProvider>
		</PostHogProvider>
	);
}
