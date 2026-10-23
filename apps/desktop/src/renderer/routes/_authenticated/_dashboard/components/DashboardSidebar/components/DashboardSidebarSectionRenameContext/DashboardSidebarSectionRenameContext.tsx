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

type DashboardSidebarSectionRenameActions = Pick<
	DashboardSidebarSectionRenameContextValue,
	"requestSectionRename" | "clearPendingSectionRename"
>;

/**
 * The two callbacks alone. They never change, while the pending id changes
 * on every group creation; a sidebar row that only requests a rename must not
 * re-render with it.
 */
const DashboardSidebarSectionRenameActionsContext =
	createContext<DashboardSidebarSectionRenameActions | null>(null);

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

	const actions = useMemo(
		() => ({ clearPendingSectionRename, requestSectionRename }),
		[clearPendingSectionRename, requestSectionRename],
	);

	return (
		<DashboardSidebarSectionRenameActionsContext.Provider value={actions}>
			<DashboardSidebarSectionRenameContext.Provider value={value}>
				{children}
			</DashboardSidebarSectionRenameContext.Provider>
		</DashboardSidebarSectionRenameActionsContext.Provider>
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

export function useDashboardSidebarSectionRenameActions(): DashboardSidebarSectionRenameActions {
	const actions = useContext(DashboardSidebarSectionRenameActionsContext);
	if (!actions) {
		throw new Error(
			"useDashboardSidebarSectionRenameActions must be used within DashboardSidebarSectionRenameProvider",
		);
	}
	return actions;
}
