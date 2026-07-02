import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useRef,
} from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { selectSidebarVisibleWorkspaceIds } from "./selectSidebarVisibleWorkspaceIds";

interface SidebarVisibilityContextValue {
	/** Workspace ids that render in the sidebar — the one gate for ports + notifications. */
	visibleWorkspaceIds: ReadonlySet<string>;
}

const SidebarVisibilityContext =
	createContext<SidebarVisibilityContextValue | null>(null);

function fingerprint(ids: Set<string>): string {
	return Array.from(ids).sort().join("\n");
}

/**
 * Computes the sidebar-visible workspace id set once, from a single set of live
 * queries, and shares it so the sidebar tree, ports list, and notifications all
 * gate on the exact same membership — no parallel re-derivation that can drift
 * or race across independent subscriptions (the #5134/#5197 regression).
 *
 * Stabilized two ways: the value is held across renders while it is unchanged
 * (reference equality for consumers), and it is held at its last good value
 * while any source collection is not ready, so a transient empty/resyncing
 * collection never blinks the ports list below what the sidebar is showing.
 */
export function SidebarVisibilityProvider({
	children,
}: {
	children: ReactNode;
}) {
	const collections = useCollections();
	const { machineId } = useLocalHostService();

	const { data: sidebarProjects = [], isReady: projectsReady } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarProjects: collections.v2SidebarProjects })
				.innerJoin(
					{ projects: collections.v2Projects },
					({ sidebarProjects, projects }) =>
						eq(sidebarProjects.projectId, projects.id),
				)
				.select(({ projects }) => ({ id: projects.id })),
		[collections],
	);

	const { data: localStateWorkspaces = [], isReady: localStateReady } =
		useLiveQuery(
			(q) =>
				q
					.from({ sidebarWorkspaces: collections.v2WorkspaceLocalState })
					.innerJoin(
						{ workspaces: collections.v2Workspaces },
						({ sidebarWorkspaces, workspaces }) =>
							eq(sidebarWorkspaces.workspaceId, workspaces.id),
					)
					.select(({ sidebarWorkspaces, workspaces }) => ({
						id: workspaces.id,
						projectId: sidebarWorkspaces.sidebarState.projectId,
						isHidden: sidebarWorkspaces.sidebarState.isHidden,
					})),
			[collections],
		);

	const { data: mainWorkspaces = [], isReady: mainReady } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.where(({ workspaces }) => eq(workspaces.type, "main"))
				.select(({ workspaces }) => ({
					id: workspaces.id,
					projectId: workspaces.projectId,
					hostId: workspaces.hostId,
				})),
		[collections],
	);

	const ready = projectsReady && localStateReady && mainReady;

	const computed = useMemo(
		() =>
			selectSidebarVisibleWorkspaceIds({
				localStateWorkspaces,
				mainWorkspaces,
				sidebarProjectIds: new Set(
					sidebarProjects.map((project) => project.id),
				),
				machineId,
			}),
		[localStateWorkspaces, mainWorkspaces, sidebarProjects, machineId],
	);

	const stableRef = useRef<{
		fingerprint: string;
		value: SidebarVisibilityContextValue;
	} | null>(null);

	const value = useMemo(() => {
		// Hold the last good set while a source collection is still loading or
		// resyncing so the gate never collapses beneath the rendered sidebar.
		if (!ready && stableRef.current) return stableRef.current.value;

		const nextFingerprint = fingerprint(computed);
		if (stableRef.current?.fingerprint === nextFingerprint) {
			return stableRef.current.value;
		}
		const nextValue: SidebarVisibilityContextValue = {
			visibleWorkspaceIds: computed,
		};
		stableRef.current = { fingerprint: nextFingerprint, value: nextValue };
		return nextValue;
	}, [computed, ready]);

	return (
		<SidebarVisibilityContext.Provider value={value}>
			{children}
		</SidebarVisibilityContext.Provider>
	);
}

/**
 * The set of workspace ids currently rendered in the sidebar. Gate ports,
 * notifications, and the sidebar tree's own workspaces on this so they agree.
 */
export function useSidebarVisibility(): SidebarVisibilityContextValue {
	const context = useContext(SidebarVisibilityContext);
	if (!context) {
		throw new Error(
			"useSidebarVisibility must be used within a SidebarVisibilityProvider",
		);
	}
	return context;
}
