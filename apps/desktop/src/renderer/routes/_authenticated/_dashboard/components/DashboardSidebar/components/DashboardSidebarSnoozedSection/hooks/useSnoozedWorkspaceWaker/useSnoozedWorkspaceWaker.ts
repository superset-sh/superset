import { useEffect, useReducer, useRef } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useSidebarWorkspaceStatuses } from "../../../../providers/DashboardSidebarWorkspaceStatusProvider";
import type { DashboardSidebarSnoozedWorkspace } from "../../../../types";
import { findWorkspacesToWake, needsAttention } from "./findWorkspacesToWake";

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export function useSnoozedWorkspaceWaker(
	snoozedWorkspaces: DashboardSidebarSnoozedWorkspace[],
) {
	const { setWorkspaceSnoozed } = useDashboardSidebarState();
	const statuses = useSidebarWorkspaceStatuses();
	const [tick, onWakeTimeReached] = useReducer((n: number) => n + 1, 0);
	const previousAttentionRef = useRef<Map<string, boolean>>(new Map());

	const nextWakeAt = snoozedWorkspaces[0]?.snoozedUntil;
	useEffect(() => {
		if (nextWakeAt === undefined) return;
		const timer = setTimeout(
			onWakeTimeReached,
			Math.min(Math.max(0, nextWakeAt - Date.now()) + 50, MAX_TIMEOUT_MS),
		);
		return () => clearTimeout(timer);
	}, [nextWakeAt]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: the tick re-reads Date.now() when a wake time passes
	useEffect(() => {
		const attentionById = new Map(
			snoozedWorkspaces.map((workspace) => [
				workspace.id,
				needsAttention(statuses.get(workspace.id)),
			]),
		);
		const toWake = findWorkspacesToWake({
			snoozed: snoozedWorkspaces,
			now: Date.now(),
			attentionById,
			previousAttentionById: previousAttentionRef.current,
		});
		previousAttentionRef.current = attentionById;
		for (const id of toWake) {
			const workspace = snoozedWorkspaces.find((row) => row.id === id);
			setWorkspaceSnoozed(id, workspace?.projectId ?? null, null);
		}
	}, [snoozedWorkspaces, statuses, setWorkspaceSnoozed, tick]);
}
