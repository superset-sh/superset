import type React from "react";
import { TRPCProvider } from "./TRPCProvider";

interface AppProvidersProps {
	children: React.ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
	return <TRPCProvider>{children}</TRPCProvider>;
}
