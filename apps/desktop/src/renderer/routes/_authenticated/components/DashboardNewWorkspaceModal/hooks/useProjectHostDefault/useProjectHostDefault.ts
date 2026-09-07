import { useEffect, useRef } from "react";
import { useV2WorkspaceCreateDefaultsStore } from "renderer/stores/v2-workspace-create-defaults";

interface UseProjectHostDefaultOptions {
	/** Create surface is showing. Closing it re-arms the seeding. */
	isOpen: boolean;
	projectId: string | null;
	/** Explicit "No project" choice — sessions keep the global default. */
	isSession: boolean;
	onSelectHostId: (hostId: string) => void;
}

/**
 * Points the create surface at the host a project was last created on.
 *
 * The host picker remembers one global choice, so someone alternating between
 * a project that lives on a remote host and one they build locally kept
 * finding the picker on the other project's machine. A project that has been
 * created on a host before now re-selects it whenever that project is picked.
 *
 * Projects with no remembered host — and project-less sessions — are left
 * alone on the global `lastHostId` the surface already seeded.
 */
export function useProjectHostDefault({
	isOpen,
	projectId,
	isSession,
	onSelectHostId,
}: UseProjectHostDefaultOptions) {
	const rememberedHostId = useV2WorkspaceCreateDefaultsStore((state) =>
		projectId ? (state.hostIdsByProjectId[projectId] ?? null) : null,
	);
	// The project the remembered host has already been applied for. Re-picking
	// the same project must not undo a host the user changed by hand since.
	const appliedForProjectRef = useRef<string | null>(null);

	useEffect(() => {
		if (!isOpen) {
			appliedForProjectRef.current = null;
			return;
		}
		if (isSession || !projectId) return;
		if (appliedForProjectRef.current === projectId) return;
		appliedForProjectRef.current = projectId;
		if (!rememberedHostId) return;
		onSelectHostId(rememberedHostId);
	}, [isOpen, isSession, onSelectHostId, projectId, rememberedHostId]);
}
