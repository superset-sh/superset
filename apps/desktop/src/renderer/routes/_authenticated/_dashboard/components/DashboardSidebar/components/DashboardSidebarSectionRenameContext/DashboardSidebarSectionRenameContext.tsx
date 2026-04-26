import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";

interface DashboardSidebarSectionRenameContextValue {
	pendingRenameSectionId: string | null;
	requestSectionRename: (sectionId: string) => void;
	clearPendingSectionRename: (sectionId: string) => void;
}

const DashboardSidebarSectionRenameContext =
	createContext<DashboardSidebarSectionRenameContextValue | null>(null);

interface DashboardSidebarSectionRenameProviderProps {
	children: ReactNode;
}

export function DashboardSidebarSectionRenameProvider({
	children,
}: DashboardSidebarSectionRenameProviderProps) {
	const [pendingRenameSectionId, setPendingRenameSectionId] = useState<
		string | null
	>(null);

	const requestSectionRename = useCallback((sectionId: string) => {
		setPendingRenameSectionId(sectionId);
	}, []);

	const clearPendingSectionRename = useCallback((sectionId: string) => {
		setPendingRenameSectionId((currentSectionId) =>
			currentSectionId === sectionId ? null : currentSectionId,
		);
	}, []);

	const value = useMemo(
		() => ({
			clearPendingSectionRename,
			pendingRenameSectionId,
			requestSectionRename,
		}),
		[clearPendingSectionRename, pendingRenameSectionId, requestSectionRename],
	);

	return (
		<DashboardSidebarSectionRenameContext.Provider value={value}>
			{children}
		</DashboardSidebarSectionRenameContext.Provider>
	);
}

export function useDashboardSidebarSectionRename() {
	const context = useContext(DashboardSidebarSectionRenameContext);
	if (!context) {
		throw new Error(
			"useDashboardSidebarSectionRename must be used within DashboardSidebarSectionRenameProvider",
		);
	}
	return context;
}
