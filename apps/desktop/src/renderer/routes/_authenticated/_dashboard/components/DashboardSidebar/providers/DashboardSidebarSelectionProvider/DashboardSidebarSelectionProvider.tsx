import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	applyWorkspaceSelection,
	EMPTY_WORKSPACE_SELECTION,
	shouldClearWorkspaceSelectionOnEscape,
	type WorkspaceSelectionState,
	workspaceSelectionModeFromModifiers,
} from "./workspaceSelection";

export interface WorkspaceSelectionEvent {
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
	preventDefault: () => void;
	stopPropagation: () => void;
}

interface SelectWorkspaceOptions {
	workspaceId: string;
	projectId: string;
	orderedWorkspaceIds: string[];
}

interface DashboardSidebarSelectionContextValue {
	selectedProjectId: string | null;
	selectedWorkspaceIds: string[];
	clearSelection: () => void;
	isWorkspaceSelected: (workspaceId: string) => boolean;
	removeSelectedWorkspaces: (workspaceIds: string[]) => void;
	selectWorkspaceFromEvent: (
		event: WorkspaceSelectionEvent,
		options: SelectWorkspaceOptions,
	) => boolean;
}

interface DashboardSidebarSelectionProviderProps {
	availableWorkspaceIds: ReadonlySet<string>;
	children: ReactNode;
}

const DashboardSidebarSelectionContext =
	createContext<DashboardSidebarSelectionContextValue | null>(null);

export function DashboardSidebarSelectionProvider({
	availableWorkspaceIds,
	children,
}: DashboardSidebarSelectionProviderProps) {
	const [selection, setSelection] = useState<WorkspaceSelectionState>(
		EMPTY_WORKSPACE_SELECTION,
	);

	const clearSelection = useCallback(() => {
		setSelection(EMPTY_WORKSPACE_SELECTION);
	}, []);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const target = event.target;
			const fromTransientSurface =
				target instanceof Element &&
				target.closest(
					'[role="menu"], [role="dialog"], [role="alertdialog"]',
				) !== null;
			if (
				!shouldClearWorkspaceSelectionOnEscape({
					key: event.key,
					defaultPrevented: event.defaultPrevented,
					fromTransientSurface,
				})
			) {
				return;
			}
			setSelection(EMPTY_WORKSPACE_SELECTION);
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	useEffect(() => {
		setSelection((current) => {
			const selectedIds = current.selectedIds.filter((id) =>
				availableWorkspaceIds.has(id),
			);
			if (selectedIds.length === current.selectedIds.length) return current;
			if (selectedIds.length === 0) return EMPTY_WORKSPACE_SELECTION;
			return {
				...current,
				selectedIds,
				anchorId:
					current.anchorId && availableWorkspaceIds.has(current.anchorId)
						? current.anchorId
						: selectedIds[0],
			};
		});
	}, [availableWorkspaceIds]);

	const selectWorkspaceFromEvent = useCallback(
		(
			event: WorkspaceSelectionEvent,
			options: SelectWorkspaceOptions,
		): boolean => {
			const mode = workspaceSelectionModeFromModifiers(event);
			if (!mode) {
				setSelection(EMPTY_WORKSPACE_SELECTION);
				return false;
			}

			event.preventDefault();
			event.stopPropagation();
			setSelection((current) =>
				applyWorkspaceSelection(current, { ...options, mode }),
			);
			return true;
		},
		[],
	);

	const removeSelectedWorkspaces = useCallback((workspaceIds: string[]) => {
		const removedIds = new Set(workspaceIds);
		setSelection((current) => {
			const selectedIds = current.selectedIds.filter(
				(id) => !removedIds.has(id),
			);
			if (selectedIds.length === 0) return EMPTY_WORKSPACE_SELECTION;
			return {
				...current,
				selectedIds,
				anchorId:
					current.anchorId && !removedIds.has(current.anchorId)
						? current.anchorId
						: selectedIds[0],
			};
		});
	}, []);

	const selectedWorkspaceIdSet = useMemo(
		() => new Set(selection.selectedIds),
		[selection.selectedIds],
	);
	const isWorkspaceSelected = useCallback(
		(workspaceId: string) => selectedWorkspaceIdSet.has(workspaceId),
		[selectedWorkspaceIdSet],
	);

	const value = useMemo<DashboardSidebarSelectionContextValue>(
		() => ({
			selectedProjectId: selection.projectId,
			selectedWorkspaceIds: selection.selectedIds,
			clearSelection,
			isWorkspaceSelected,
			removeSelectedWorkspaces,
			selectWorkspaceFromEvent,
		}),
		[
			selection.projectId,
			selection.selectedIds,
			clearSelection,
			isWorkspaceSelected,
			removeSelectedWorkspaces,
			selectWorkspaceFromEvent,
		],
	);

	return (
		<DashboardSidebarSelectionContext.Provider value={value}>
			{children}
		</DashboardSidebarSelectionContext.Provider>
	);
}

export function useDashboardSidebarSelection() {
	const context = useContext(DashboardSidebarSelectionContext);
	if (!context) {
		throw new Error(
			"useDashboardSidebarSelection must be used within DashboardSidebarSelectionProvider",
		);
	}
	return context;
}
