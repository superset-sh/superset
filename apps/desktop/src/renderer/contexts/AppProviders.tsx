import type React from "react";
import { MonacoProvider } from "./MonacoProvider";
import { TRPCProvider } from "./TRPCProvider";

interface AppProvidersProps {
	children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
	return (
		<TRPCProvider>
			<MonacoProvider>{children}</MonacoProvider>
		</TRPCProvider>
	);
}
