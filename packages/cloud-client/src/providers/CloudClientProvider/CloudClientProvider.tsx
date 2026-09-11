import { createContext, type ReactNode, useContext } from "react";
import type { CloudCaller } from "../../types";

const CloudClientContext = createContext<CloudCaller | null>(null);

interface CloudClientProviderProps {
	caller: CloudCaller;
	children: ReactNode;
}

export function CloudClientProvider({
	caller,
	children,
}: CloudClientProviderProps) {
	return (
		<CloudClientContext.Provider value={caller}>
			{children}
		</CloudClientContext.Provider>
	);
}

export function useCloudClient(): CloudCaller {
	const caller = useContext(CloudClientContext);
	if (!caller) {
		throw new Error("useCloudClient must be used within CloudClientProvider");
	}
	return caller;
}
