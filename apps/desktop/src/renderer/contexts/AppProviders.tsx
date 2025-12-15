import type React from "react";
import { MonacoProvider } from "./MonacoProvider";
import { PostHogProvider } from "./PostHogProvider";
import { TRPCProvider } from "./TRPCProvider";

interface AppProvidersProps {
	children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
	return (
		<PostHogProvider>
			<TRPCProvider>
				<MonacoProvider>{children}</MonacoProvider>
			</TRPCProvider>
		</PostHogProvider>
	);
}
