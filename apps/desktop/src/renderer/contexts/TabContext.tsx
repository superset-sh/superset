import type React from "react";
import { createContext, useContext } from "react";
import type { Tab, Worktree } from "shared/types";
import { useTabs } from "../screens/main/hooks";
import { useWorkspaceContext } from "./WorkspaceContext";

interface TabContextValue {
	selectedWorktreeId: string | null;
	setSelectedWorktreeId: (id: string | null) => void;
	selectedTabId: string | null;
	setSelectedTabId: (id: string | null) => void;
	selectedWorktree: Worktree | undefined;
	selectedTab: Tab | undefined;
	parentGroupTab: Tab | undefined;
	handleTabCreated: (worktreeId: string, tab: Tab) => void;
	handleTabSelect: (worktreeId: string, tabId: string) => void;
	handleTabFocus: (tabId: string) => void;
}

const TabContext = createContext<TabContextValue | undefined>(undefined);

interface TabProviderProps {
	children: React.ReactNode;
	selectedWorktreeId: string | null;
	setSelectedWorktreeId: (id: string | null) => void;
	selectedTabId: string | null;
	setSelectedTabId: (id: string | null) => void;
}

export function TabProvider({
	children,
	selectedWorktreeId,
	setSelectedWorktreeId,
	selectedTabId,
	setSelectedTabId,
}: TabProviderProps) {
	const { currentWorkspace, setCurrentWorkspace } = useWorkspaceContext();

	const tabData = useTabs({
		currentWorkspace,
		setCurrentWorkspace,
		selectedWorktreeId,
		setSelectedWorktreeId,
		selectedTabId,
		setSelectedTabId,
	});

	return <TabContext.Provider value={tabData}>{children}</TabContext.Provider>;
}

export function useTabContext() {
	const context = useContext(TabContext);
	if (context === undefined) {
		throw new Error("useTabContext must be used within a TabProvider");
	}
	return context;
}
