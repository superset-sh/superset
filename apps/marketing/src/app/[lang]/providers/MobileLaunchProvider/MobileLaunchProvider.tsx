"use client";

import { createContext, type ReactNode, useContext } from "react";

const MobileLaunchContext = createContext(false);

interface MobileLaunchProviderProps {
	isLaunched: boolean;
	children: ReactNode;
}

export function MobileLaunchProvider({
	isLaunched,
	children,
}: MobileLaunchProviderProps) {
	return (
		<MobileLaunchContext.Provider value={isLaunched}>
			{children}
		</MobileLaunchContext.Provider>
	);
}

export function useIsMobileLaunched(): boolean {
	return useContext(MobileLaunchContext);
}
