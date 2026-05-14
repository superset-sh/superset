import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useHotkey } from "renderer/hotkeys";
import { logStressEvent } from "renderer/lib/performance/stress-instrumentation";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import type { DashboardSidebarProject } from "../../types";
import { getProjectChildrenWorkspaces } from "../../utils/projectChildren";
import {
	getRelativeWorkspaceTarget,
	shouldRunWorkspaceSwitchHotkey,
	WORKSPACE_SWITCH_HOTKEY_RELEASE_MS,
	type WorkspaceSwitchDirection,
} from "./useDashboardSidebarShortcuts.utils";

interface WorkspaceLocation {
	projectId: string;
	projectIsCollapsed: boolean;
	sectionId: string | null;
	sectionIsCollapsed: boolean;
}

const MAX_SHORTCUT_COUNT = 9;
const WORKSPACE_SWITCH_DROP_LOG_INTERVAL_MS = 1_000;

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
) {
	const navigate = useNavigate();
	const { toggleProjectCollapsed, toggleSectionCollapsed } =
		useDashboardSidebarState();
	const flattenedWorkspaces = useMemo(
		() =>
			groups
				.flatMap((project) => getProjectChildrenWorkspaces(project.children))
				.filter((workspace) => !workspace.creationStatus),
		[groups],
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
						sectionId: null,
						sectionIsCollapsed: false,
					});
					continue;
				}
				for (const workspace of child.section.workspaces) {
					map.set(workspace.id, {
						projectId: project.id,
						projectIsCollapsed: project.isCollapsed,
						sectionId: child.section.id,
						sectionIsCollapsed: child.section.isCollapsed,
					});
				}
			}
		}
		return map;
	}, [groups]);

	const revealWorkspace = useCallback(
		(workspaceId: string) => {
			const location = workspaceLocations.get(workspaceId);
			if (!location) return;
			if (location.projectIsCollapsed) {
				toggleProjectCollapsed(location.projectId);
			}
			if (location.sectionId && location.sectionIsCollapsed) {
				toggleSectionCollapsed(location.sectionId);
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
	const latestRelativeSwitchStateRef = useRef({
		currentWorkspaceId,
		flattenedWorkspaces,
		navigate,
		revealWorkspace,
	});
	latestRelativeSwitchStateRef.current = {
		currentWorkspaceId,
		flattenedWorkspaces,
		navigate,
		revealWorkspace,
	};
	const lastRelativeSwitchAtRef = useRef(Number.NEGATIVE_INFINITY);
	const relativeSwitchInFlightRef = useRef(false);
	const relativeSwitchReleaseTimerRef = useRef<ReturnType<
		typeof setTimeout
	> | null>(null);
	const pendingRelativeSwitchDirectionRef =
		useRef<WorkspaceSwitchDirection | null>(null);
	const relativeSwitchDropLogRef = useRef({
		count: 0,
		lastLoggedAt: Number.NEGATIVE_INFINITY,
	});
	const runRelativeWorkspaceSwitchRef = useRef<
		(
			direction: WorkspaceSwitchDirection,
			source: "hotkey" | "coalesced",
		) => void
	>(() => {});

	const scheduleRelativeSwitchRelease = useCallback((delayMs: number) => {
		if (relativeSwitchReleaseTimerRef.current) {
			clearTimeout(relativeSwitchReleaseTimerRef.current);
		}
		relativeSwitchReleaseTimerRef.current = setTimeout(() => {
			relativeSwitchInFlightRef.current = false;
			relativeSwitchReleaseTimerRef.current = null;

			const pendingDirection = pendingRelativeSwitchDirectionRef.current;
			pendingRelativeSwitchDirectionRef.current = null;
			if (pendingDirection) {
				runRelativeWorkspaceSwitchRef.current(pendingDirection, "coalesced");
			}
		}, delayMs);
	}, []);

	useEffect(() => {
		return () => {
			if (relativeSwitchReleaseTimerRef.current) {
				clearTimeout(relativeSwitchReleaseTimerRef.current);
			}
			pendingRelativeSwitchDirectionRef.current = null;
		};
	}, []);

	const runRelativeWorkspaceSwitch = useCallback(
		(direction: WorkspaceSwitchDirection, source: "hotkey" | "coalesced") => {
			const now = performance.now();
			const {
				currentWorkspaceId: latestCurrentWorkspaceId,
				flattenedWorkspaces: latestFlattenedWorkspaces,
				navigate: latestNavigate,
				revealWorkspace: latestRevealWorkspace,
			} = latestRelativeSwitchStateRef.current;
			const target = getRelativeWorkspaceTarget(
				latestFlattenedWorkspaces,
				latestCurrentWorkspaceId,
				direction,
			);
			if (!target) return;

			lastRelativeSwitchAtRef.current = now;
			relativeSwitchInFlightRef.current = true;
			scheduleRelativeSwitchRelease(WORKSPACE_SWITCH_HOTKEY_RELEASE_MS);
			latestRevealWorkspace(target.id);
			logStressEvent("workspace-switch-hotkey.navigate", {
				direction,
				source,
				from: latestCurrentWorkspaceId,
				to: target.id,
			});
			void navigateToV2Workspace(target.id, latestNavigate, { replace: true });
		},
		[scheduleRelativeSwitchRelease],
	);
	runRelativeWorkspaceSwitchRef.current = runRelativeWorkspaceSwitch;

	const switchRelativeWorkspace = useCallback(
		(direction: WorkspaceSwitchDirection, event: KeyboardEvent) => {
			const now = performance.now();
			const shouldRun = shouldRunWorkspaceSwitchHotkey({
				isNavigating: relativeSwitchInFlightRef.current,
				now,
				lastRunAt: lastRelativeSwitchAtRef.current,
			});
			if (!shouldRun) {
				pendingRelativeSwitchDirectionRef.current = direction;
				if (!relativeSwitchReleaseTimerRef.current) {
					const remainingMs = Math.max(
						0,
						WORKSPACE_SWITCH_HOTKEY_RELEASE_MS -
							(now - lastRelativeSwitchAtRef.current),
					);
					relativeSwitchInFlightRef.current = true;
					scheduleRelativeSwitchRelease(remainingMs);
				}

				const dropLog = relativeSwitchDropLogRef.current;
				dropLog.count++;
				if (
					now - dropLog.lastLoggedAt >=
					WORKSPACE_SWITCH_DROP_LOG_INTERVAL_MS
				) {
					logStressEvent("workspace-switch-hotkey.coalesced", {
						direction,
						count: dropLog.count,
						repeated: event.repeat,
						navigating: relativeSwitchInFlightRef.current,
					});
					dropLog.count = 0;
					dropLog.lastLoggedAt = now;
				}
				return;
			}

			pendingRelativeSwitchDirectionRef.current = null;
			runRelativeWorkspaceSwitch(direction, "hotkey");
		},
		[runRelativeWorkspaceSwitch, scheduleRelativeSwitchRelease],
	);

	useHotkey("PREV_WORKSPACE", (event) => {
		switchRelativeWorkspace("previous", event);
	});

	useHotkey("NEXT_WORKSPACE", (event) => {
		switchRelativeWorkspace("next", event);
	});

	return workspaceShortcutLabels;
}
