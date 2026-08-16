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

// Project rows reuse the workspace selection algorithm (toggle/range/anchor)
// under one fixed scope, since all selectable projects share the sidebar.
const PROJECT_SELECTION_SCOPE = "__sidebar-projects__";

interface DashboardSidebarSelectionContextValue {
	selectedProjectId: string | null;
	selectedWorkspaceIds: string[];
	selectedProjectIds: string[];
	clearSelection: () => void;
	isWorkspaceSelected: (workspaceId: string) => boolean;
	isProjectSelected: (projectId: string) => boolean;
	removeSelectedWorkspaces: (workspaceIds: string[]) => void;
	selectWorkspaceFromEvent: (
		event: WorkspaceSelectionEvent,
		options: SelectWorkspaceOptions,
	) => boolean;
	selectProjectFromEvent: (
		event: WorkspaceSelectionEvent,
		projectId: string,
	) => boolean;
}

interface DashboardSidebarSelectionProviderProps {
	availableWorkspaceIds: ReadonlySet<string>;
	/** Project ids in rendered order — range selection follows this order. */
	orderedProjectIds: string[];
	children: ReactNode;
}

const DashboardSidebarSelectionContext =
	createContext<DashboardSidebarSelectionContextValue | null>(null);

export function DashboardSidebarSelectionProvider({
	availableWorkspaceIds,
	orderedProjectIds,
	children,
}: DashboardSidebarSelectionProviderProps) {
	const [selection, setSelection] = useState<WorkspaceSelectionState>(
		EMPTY_WORKSPACE_SELECTION,
	);
	const [projectSelection, setProjectSelection] =
		useState<WorkspaceSelectionState>(EMPTY_WORKSPACE_SELECTION);

	const clearSelection = useCallback(() => {
		setSelection(EMPTY_WORKSPACE_SELECTION);
		setProjectSelection(EMPTY_WORKSPACE_SELECTION);
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
			setProjectSelection(EMPTY_WORKSPACE_SELECTION);
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

	// Prune project selection when rows leave the rendered order (folder
	// collapsed, project removed) — mirrors the workspace pruning above.
	useEffect(() => {
		const orderedIdSet = new Set(orderedProjectIds);
		setProjectSelection((current) => {
			const selectedIds = current.selectedIds.filter((id) =>
				orderedIdSet.has(id),
			);
			if (selectedIds.length === current.selectedIds.length) return current;
			if (selectedIds.length === 0) return EMPTY_WORKSPACE_SELECTION;
			return {
				...current,
				selectedIds,
				anchorId:
					current.anchorId && orderedIdSet.has(current.anchorId)
						? current.anchorId
						: selectedIds[0],
			};
		});
	}, [orderedProjectIds]);

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
			// Workspace and project selections are mutually exclusive: one
			// toolbar, one kind of bulk action at a time.
			setProjectSelection(EMPTY_WORKSPACE_SELECTION);
			setSelection((current) =>
				applyWorkspaceSelection(current, { ...options, mode }),
			);
			return true;
		},
		[],
	);

	const selectProjectFromEvent = useCallback(
		(event: WorkspaceSelectionEvent, projectId: string): boolean => {
			const mode = workspaceSelectionModeFromModifiers(event);
			if (!mode) {
				setProjectSelection(EMPTY_WORKSPACE_SELECTION);
				return false;
			}

			event.preventDefault();
			event.stopPropagation();
			setSelection(EMPTY_WORKSPACE_SELECTION);
			setProjectSelection((current) =>
				applyWorkspaceSelection(current, {
					workspaceId: projectId,
					projectId: PROJECT_SELECTION_SCOPE,
					orderedWorkspaceIds: orderedProjectIds,
					mode,
				}),
			);
			return true;
		},
		[orderedProjectIds],
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

	const selectedProjectIdSet = useMemo(
		() => new Set(projectSelection.selectedIds),
		[projectSelection.selectedIds],
	);
	const isProjectSelected = useCallback(
		(projectId: string) => selectedProjectIdSet.has(projectId),
		[selectedProjectIdSet],
	);

	const value = useMemo<DashboardSidebarSelectionContextValue>(
		() => ({
			selectedProjectId: selection.projectId,
			selectedWorkspaceIds: selection.selectedIds,
			selectedProjectIds: projectSelection.selectedIds,
			clearSelection,
			isWorkspaceSelected,
			isProjectSelected,
			removeSelectedWorkspaces,
			selectWorkspaceFromEvent,
			selectProjectFromEvent,
		}),
		[
			selection.projectId,
			selection.selectedIds,
			projectSelection.selectedIds,
			clearSelection,
			isWorkspaceSelected,
			isProjectSelected,
			removeSelectedWorkspaces,
			selectWorkspaceFromEvent,
			selectProjectFromEvent,
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
