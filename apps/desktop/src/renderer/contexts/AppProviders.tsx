import type React from "react";
import { AuthProvider } from "./AuthProvider";
import { TRPCProvider } from "./TRPCProvider";

interface AppProvidersProps {
	children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
	return (
		<TRPCProvider>
			<AuthProvider>{children}</AuthProvider>
		</TRPCProvider>
	);
}
