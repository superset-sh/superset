import { useEffect, useRef } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useHostTagFolders } from "renderer/hooks/host-projects/useHostTagFolders";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { isSidebarWorkspaceVisible } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { getLegacyPresentationPushTargets } from "./getLegacyPresentationPushTargets";
import {
	type MigrationHostRow,
	migrateLegacySidebarFolders,
} from "./migrateLegacySidebarFolders";

// Session-scoped: a folder whose host REJECTED a write is parked until the
// next app launch, so the effect (which re-runs on every workspace-cache
// change) can't hammer a permanently failing host.
const sessionParkedFolders = new Set<string>();
// One presentation push per (host, project, tag) per session — the broadcast
// that follows each push re-runs the effect, and without this the check below
// races its own in-flight write. Host identity matters: one replica's success
// must not suppress a missing row on another replica.
const sessionPushedSettings = new Set<string>();

/**
 * Background conversion of legacy uuid-keyed folders to tag-backed folders.
 * Runs whenever the workspace cache or the section rows change; a folder
 * whose host is offline simply stays legacy until a later run.
 */
export function useMigrateLegacySidebarFolders(): void {
	const collections = useCollections();
	const { workspaces: hostWorkspaces, cache, isReady } = useHostWorkspaces();
	const { projects: hostProjects } = useHostProjects();
	const { hostResults: tagFolderHostResults } = useHostTagFolders();
	const runningRef = useRef(false);

	// One-time presentation push: rows customised before settings moved
	// host-side (a migrated group's colour, a materialized folder's label)
	// get their colour/name copied up so they follow the user to every
	// device. The local row keeps rendering identically either way — host
	// settings take precedence over the same values.
	useEffect(() => {
		if (!isReady) return;
		for (const section of collections.v2SidebarSections.state.values()) {
			const tag = section.tag;
			if (tag == null) continue;
			const hasCustomColor = section.color != null;
			const hasCustomName = section.name !== tag;
			if (!hasCustomColor && !hasCustomName) continue;
			const project = hostProjects.find(
				(item) => item.projectKey === section.projectId,
			);
			if (!project) continue;
			const targets = getLegacyPresentationPushTargets({
				hostIds: project.hostIds,
				scope: section.projectId,
				tag,
				hostResults: tagFolderHostResults,
			});
			for (const target of targets) {
				const pushKey = `${target.machineId}\u0000${section.projectId}\u0000${tag}`;
				if (sessionPushedSettings.has(pushKey)) continue;
				sessionPushedSettings.add(pushKey);
				void getHostServiceClientByUrl(target.hostUrl)
					.tagFolders.upsert.mutate({
						scope: section.projectId,
						tag,
						...(hasCustomName ? { displayName: section.name } : {}),
						...(hasCustomColor ? { color: section.color } : {}),
					})
					.catch((error: unknown) => {
						console.warn(
							"[sidebar-tag-migration] presentation push failed:",
							error,
						);
					});
			}
		}
	}, [collections, hostProjects, tagFolderHostResults, isReady]);

	useEffect(() => {
		if (!isReady || runningRef.current) return;
		const sections = Array.from(collections.v2SidebarSections.state.values());
		if (!sections.some((section) => section.tag == null)) return;

		const hostRowsById = new Map<string, MigrationHostRow>(
			hostWorkspaces.map((workspace) => [
				workspace.id,
				{
					id: workspace.id,
					projectId: workspace.projectId,
					tags: workspace.tags,
					hostReachable:
						workspace.hostReachable &&
						cache.resolveHostUrl(workspace.hostId) !== null,
				},
			]),
		);

		runningRef.current = true;
		void migrateLegacySidebarFolders(
			{
				sections,
				localRows: Array.from(
					collections.v2WorkspaceLocalState.state.values(),
				).map((row) => ({
					workspaceId: row.workspaceId,
					sectionId: row.sidebarState.sectionId,
					isVisible: isSidebarWorkspaceVisible(row),
				})),
				hostRowsById,
				writeTags: async (workspaceId, tags) => {
					const workspace = hostWorkspaces.find(
						(item) => item.id === workspaceId,
					);
					if (!workspace) throw new Error("Workspace not found");
					const hostUrl = cache.resolveHostUrl(workspace.hostId);
					if (!hostUrl) throw new Error("Host offline");
					await getHostServiceClientByUrl(hostUrl).workspace.update.mutate({
						id: workspaceId,
						tags,
					});
					cache.upsertWorkspace({
						...workspace,
						tags,
						worktreePath: workspace.worktreePath ?? "",
						worktreeExists: workspace.worktreeExists ?? true,
						updatedAt: new Date(),
					});
				},
				insertSection: (row) => {
					if (collections.v2SidebarSections.get(row.sectionId)) return;
					collections.v2SidebarSections.insert(row);
				},
				deleteSection: (sectionId) => {
					if (!collections.v2SidebarSections.get(sectionId)) return;
					collections.v2SidebarSections.delete(sectionId);
				},
				clearLocalSectionId: (workspaceId, legacySectionId) => {
					const row = collections.v2WorkspaceLocalState.get(workspaceId);
					if (row?.sidebarState.sectionId !== legacySectionId) return;
					collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
						draft.sidebarState.sectionId = null;
					});
				},
			},
			sessionParkedFolders,
		)
			.catch((error) => {
				console.warn("[sidebar-tag-migration] pass failed:", error);
			})
			.finally(() => {
				runningRef.current = false;
			});
	}, [collections, hostWorkspaces, cache, isReady]);
}
