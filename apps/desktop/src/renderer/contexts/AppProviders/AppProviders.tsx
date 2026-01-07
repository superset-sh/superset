import type React from "react";
import { PostHogUserIdentifier } from "renderer/components/PostHogUserIdentifier";
import { AuthProvider, useAuth } from "../AuthProvider";
import { CollectionsProvider } from "../CollectionsProvider";
import { MonacoProvider } from "../MonacoProvider";
import { OrganizationsProvider } from "../OrganizationsProvider";
import { PostHogProvider } from "../PostHogProvider";
import { TRPCProvider } from "../TRPCProvider";

interface AppProvidersProps {
	children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
	return (
		<PostHogProvider>
			<TRPCProvider>
				<PostHogUserIdentifier />
				<AuthProvider>
					<ConditionalProviders>{children}</ConditionalProviders>
				</AuthProvider>
			</TRPCProvider>
		</PostHogProvider>
	);
}

function ConditionalProviders({ children }: AppProvidersProps) {
	const { session, token } = useAuth();

	if (!token || !session?.user) {
		return <MonacoProvider>{children}</MonacoProvider>;
	}

	return (
		<CollectionsProvider>
			<OrganizationsProvider>
				<MonacoProvider>{children}</MonacoProvider>
			</OrganizationsProvider>
		</CollectionsProvider>
	);
}
