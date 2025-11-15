import type React from "react";
import { createContext, useContext } from "react";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { useSidebar } from "../screens/main/hooks";

interface SidebarContextValue {
	sidebarPanelRef: React.RefObject<ImperativePanelHandle | null>;
	isSidebarOpen: boolean;
	setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
	showSidebarOverlay: boolean;
	setShowSidebarOverlay: React.Dispatch<React.SetStateAction<boolean>>;
	handleCollapseSidebar: () => void;
	handleExpandSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(
	undefined,
);

interface SidebarProviderProps {
	children: React.ReactNode;
}

export function SidebarProvider({ children }: SidebarProviderProps) {
	const sidebarData = useSidebar();

	return (
		<SidebarContext.Provider value={sidebarData}>
			{children}
		</SidebarContext.Provider>
	);
}

export function useSidebarContext() {
	const context = useContext(SidebarContext);
	if (context === undefined) {
		throw new Error("useSidebarContext must be used within a SidebarProvider");
	}
	return context;
}

