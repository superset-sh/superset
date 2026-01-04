import type React from "react";
import { PostHogUserIdentifier } from "renderer/components/PostHogUserIdentifier";
import { AuthProvider } from "./AuthProvider";
import { MonacoProvider } from "./MonacoProvider";
import { OrganizationProvider } from "./OrganizationProvider";
import { OrganizationsProvider } from "./OrganizationsProvider";
import { PostHogProvider } from "./PostHogProvider";
import { CollectionsProvider } from "./TanStackDbProvider";
import { TRPCProvider } from "./TRPCProvider";

interface AppProvidersProps {
	children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
	return (
		<PostHogProvider>
			<TRPCProvider>
				<AuthProvider>
					<PostHogUserIdentifier />
					<OrganizationsProvider>
						<OrganizationProvider>
							<CollectionsProvider>
								<MonacoProvider>{children}</MonacoProvider>
							</CollectionsProvider>
						</OrganizationProvider>
					</OrganizationsProvider>
				</AuthProvider>
			</TRPCProvider>
		</PostHogProvider>
	);
}
