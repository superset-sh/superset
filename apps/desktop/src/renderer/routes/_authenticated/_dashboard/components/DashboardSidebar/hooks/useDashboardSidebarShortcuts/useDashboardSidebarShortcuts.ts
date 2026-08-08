import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useRef } from "react";
import { useHotkey } from "renderer/hotkeys";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useDeletingWorkspaces } from "renderer/routes/_authenticated/providers/DeletingWorkspacesProvider";
import type {
	DashboardSidebarProject,
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../../types";
import { getProjectChildrenWorkspaces } from "../../utils/projectChildren";
import type { DashboardSidebarSessionsScope } from "../useDashboardSidebarData/buildDashboardSidebarProjects";

interface WorkspaceLocation {
	/** Null for the Sessions scope — no project row to expand. */
	projectId: string | null;
	projectIsCollapsed: boolean;
	/** Collapsed ancestor groups, outermost first — every one must expand. */
	collapsedSectionIds: string[];
}

const MAX_SHORTCUT_COUNT = 9;

function haveSameIds(left: string[], right: string[]): boolean {
	return (
		left.length === right.length &&
		left.every((id, index) => id === right[index])
	);
}

function useStableWorkspaceShortcutLabels(
	workspaces: Array<{ id: string }>,
): Map<string, string> {
	const previousRef = useRef<{
		workspaceIds: string[];
		labels: Map<string, string>;
	} | null>(null);

	return useMemo(() => {
		const workspaceIds = workspaces
			.slice(0, MAX_SHORTCUT_COUNT)
			.map((workspace) => workspace.id);
		const previous = previousRef.current;
		if (previous && haveSameIds(previous.workspaceIds, workspaceIds)) {
			return previous.labels;
		}

		const labels = new Map(
			workspaceIds.map((workspaceId, index) => [workspaceId, `⌘${index + 1}`]),
		);
		previousRef.current = { workspaceIds, labels };
		return labels;
	}, [workspaces]);
}

export function useDashboardSidebarShortcuts(
	groups: DashboardSidebarProject[],
	sessionsScope: DashboardSidebarSessionsScope = {
		looseWorkspaces: [],
		rootSections: [],
	},
) {
	const navigate = useNavigate();
	const { toggleProjectCollapsed, toggleSectionCollapsed } =
		useDashboardSidebarState();
	const { isDeleting } = useDeletingWorkspaces();
	// Sessions render above the project groups, folders-first inside groups.
	// Each entry keeps its collapsed-ancestor chain so reveal can expand it.
	const sessionEntries = useMemo(() => {
		const entries: Array<{
			workspace: DashboardSidebarWorkspace;
			collapsedSectionIds: string[];
		}> = sessionsScope.looseWorkspaces.map((workspace) => ({
			workspace,
			collapsedSectionIds: [],
		}));
		const visit = (
			section: DashboardSidebarSection,
			collapsedAncestors: string[],
		) => {
			const collapsedChain = section.isCollapsed
				? [...collapsedAncestors, section.id]
				: collapsedAncestors;
			for (const nested of section.childSections) {
				visit(nested, collapsedChain);
			}
			for (const workspace of section.workspaces) {
				entries.push({ workspace, collapsedSectionIds: collapsedChain });
			}
		};
		for (const section of sessionsScope.rootSections) {
			visit(section, []);
		}
		return entries;
	}, [sessionsScope]);
	const flattenedWorkspaces = useMemo(
		() =>
			[
				// Sessions render above the project groups.
				...sessionEntries.map((entry) => entry.workspace),
				...groups.flatMap((project) =>
					getProjectChildrenWorkspaces(project.children),
				),
			].filter((workspace) => !isDeleting(workspace.id)),
		[groups, sessionEntries, isDeleting],
	);
	const workspaceShortcutLabels =
		useStableWorkspaceShortcutLabels(flattenedWorkspaces);

	const workspaceLocations = useMemo(() => {
		const map = new Map<string, WorkspaceLocation>();
		for (const project of groups) {
			for (const child of project.children) {
				if (child.type === "workspace") {
					map.set(child.workspace.id, {
						projectId: project.id,
						projectIsCollapsed: project.isCollapsed,
						collapsedSectionIds: [],
					});
					continue;
				}
				// Nested groups: a workspace is hidden while ANY ancestor group
				// is collapsed, so reveal must expand the whole collapsed chain.
				const visitSection = (
					section: (typeof child)["section"],
					collapsedAncestors: string[],
				) => {
					const collapsedChain = section.isCollapsed
						? [...collapsedAncestors, section.id]
						: collapsedAncestors;
					for (const workspace of section.workspaces) {
						map.set(workspace.id, {
							projectId: project.id,
							projectIsCollapsed: project.isCollapsed,
							collapsedSectionIds: collapsedChain,
						});
					}
					for (const nested of section.childSections) {
						visitSection(nested, collapsedChain);
					}
				};
				visitSection(child.section, []);
			}
		}
		for (const entry of sessionEntries) {
			map.set(entry.workspace.id, {
				projectId: null,
				projectIsCollapsed: false,
				collapsedSectionIds: entry.collapsedSectionIds,
			});
		}
		return map;
	}, [groups, sessionEntries]);

	const revealWorkspace = useCallback(
		(workspaceId: string) => {
			const location = workspaceLocations.get(workspaceId);
			if (!location) return;
			if (location.projectId !== null && location.projectIsCollapsed) {
				toggleProjectCollapsed(location.projectId);
			}
			for (const sectionId of location.collapsedSectionIds) {
				toggleSectionCollapsed(sectionId);
			}
		},
		[workspaceLocations, toggleProjectCollapsed, toggleSectionCollapsed],
	);

	const switchToWorkspace = useCallback(
		(index: number) => {
			const workspace = flattenedWorkspaces[index];
			if (workspace) {
				revealWorkspace(workspace.id);
				navigateToV2Workspace(workspace.id, navigate);
			}
		},
		[flattenedWorkspaces, navigate, revealWorkspace],
	);

	useHotkey("JUMP_TO_WORKSPACE_1", () => switchToWorkspace(0));
	useHotkey("JUMP_TO_WORKSPACE_2", () => switchToWorkspace(1));
	useHotkey("JUMP_TO_WORKSPACE_3", () => switchToWorkspace(2));
	useHotkey("JUMP_TO_WORKSPACE_4", () => switchToWorkspace(3));
	useHotkey("JUMP_TO_WORKSPACE_5", () => switchToWorkspace(4));
	useHotkey("JUMP_TO_WORKSPACE_6", () => switchToWorkspace(5));
	useHotkey("JUMP_TO_WORKSPACE_7", () => switchToWorkspace(6));
	useHotkey("JUMP_TO_WORKSPACE_8", () => switchToWorkspace(7));
	useHotkey("JUMP_TO_WORKSPACE_9", () => switchToWorkspace(8));

	const matchRoute = useMatchRoute();
	const currentWorkspaceMatch = matchRoute({
		to: "/v2-workspace/$workspaceId",
		fuzzy: true,
	});
	const currentWorkspaceId =
		currentWorkspaceMatch !== false ? currentWorkspaceMatch.workspaceId : null;

	useHotkey("PREV_WORKSPACE", () => {
		if (!currentWorkspaceId || flattenedWorkspaces.length === 0) return;
		const index = flattenedWorkspaces.findIndex(
			(w) => w.id === currentWorkspaceId,
		);
		const prevIndex = index <= 0 ? flattenedWorkspaces.length - 1 : index - 1;
		const target = flattenedWorkspaces[prevIndex];
		revealWorkspace(target.id);
		navigateToV2Workspace(target.id, navigate);
	});

	useHotkey("NEXT_WORKSPACE", () => {
		if (!currentWorkspaceId || flattenedWorkspaces.length === 0) return;
		const index = flattenedWorkspaces.findIndex(
			(w) => w.id === currentWorkspaceId,
		);
		const nextIndex = index >= flattenedWorkspaces.length - 1 ? 0 : index + 1;
		const target = flattenedWorkspaces[nextIndex];
		revealWorkspace(target.id);
		navigateToV2Workspace(target.id, navigate);
	});

	return workspaceShortcutLabels;
}
