import type React from "react";
import { PostHogUserIdentifier } from "renderer/components/PostHogUserIdentifier";
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
				<OrganizationsProvider>
					<PostHogUserIdentifier />
					<MonacoProvider>{children}</MonacoProvider>
				</OrganizationsProvider>
			</TRPCProvider>
		</PostHogProvider>
	);
}
