import type React from "react";
import { useState } from "react";
import { PostHogUserIdentifier } from "renderer/components/PostHogUserIdentifier";
import { trpc } from "renderer/lib/trpc";
import { MonacoProvider } from "./MonacoProvider";
import { OrganizationsProvider } from "./OrganizationsProvider";
import { PostHogProvider } from "./PostHogProvider";
import { TanStackDbProvider } from "./TanStackDbProvider";
import { TRPCProvider } from "./TRPCProvider";

interface AppProvidersProps {
	children: React.ReactNode;
}

function TanStackDbProviderWithAuth({
	children,
}: {
	children: React.ReactNode;
}) {
	const [accessToken, setAccessToken] = useState<string | null | undefined>(
		undefined,
	);

	// Subscribe to access token from auth service
	trpc.auth.onAccessToken.useSubscription(undefined, {
		onData: (data) => {
			console.log("[TanStackDbProviderWithAuth] Raw data received:", data);
			console.log("[TanStackDbProviderWithAuth] Received access token:", {
				hasToken: !!data.accessToken,
				tokenLength: data.accessToken?.length,
				dataType: typeof data,
				accessTokenType: typeof data.accessToken,
			});
			setAccessToken(data.accessToken);
		},
		onError: (err) => {
			console.error("[TanStackDbProviderWithAuth] Subscription error:", err);
		},
	});

	console.log("[TanStackDbProviderWithAuth] Current accessToken state:", {
		hasToken: !!accessToken,
		tokenLength: accessToken?.length,
		isUndefined: accessToken === undefined,
	});

	// Wait for first emission from subscription (undefined means not received yet)
	if (accessToken === undefined) {
		console.log(
			"[TanStackDbProviderWithAuth] Waiting for access token subscription...",
		);
		return null;
	}

	return (
		<TanStackDbProvider accessToken={accessToken}>
			{children}
		</TanStackDbProvider>
	);
}

export function AppProviders({ children }: AppProvidersProps) {
	return (
		<PostHogProvider>
			<TRPCProvider>
				<PostHogUserIdentifier />
				<OrganizationsProvider>
					<TanStackDbProviderWithAuth>
						<MonacoProvider>{children}</MonacoProvider>
					</TanStackDbProviderWithAuth>
				</OrganizationsProvider>
			</TRPCProvider>
		</PostHogProvider>
	);
}
