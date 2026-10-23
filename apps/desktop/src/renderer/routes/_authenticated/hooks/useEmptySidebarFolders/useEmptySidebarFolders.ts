import { isMissingProcedureError } from "@superset/shared/missing-procedure-error";
import {
	normalizeWorkspaceTag,
	SESSIONS_TAG_SCOPE,
} from "@superset/shared/workspace-tags";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	type FindOrphanedTagFoldersInput,
	findOrphanedTagFolders,
	laneProjectIdForScope,
	type OrphanedTagFolder,
	type UnverifiedTagFolder,
	useTagFolderContext,
} from "renderer/routes/_authenticated/utils/workspaceTagFolders";
import type {
	FolderGroup,
	RemoveEmptySidebarFoldersOptions,
	RemoveEmptySidebarFoldersResult,
	SkippedSidebarFolder,
} from "./types";
import { refreshPruneSources } from "./utils/refreshPruneSources";
import {
	type FolderPruneSnapshot,
	runFolderPrune,
} from "./utils/runFolderPrune";

export type {
	EmptySidebarFolder,
	FailedSidebarFolder,
	RemoveEmptySidebarFoldersOptions,
	RemoveEmptySidebarFoldersResult,
	SidebarFolderSkipReason,
	SkippedSidebarFolder,
} from "./types";

const SOURCE_REFETCH_TIMEOUT_MS = 5_000;
const SOURCE_SETTLE_MS = 1_500;
const SOURCE_POLL_MS = 50;

function hasErrorCode(error: unknown, code: string): boolean {
	return (error as { data?: { code?: unknown } } | null)?.data?.code === code;
}

/** Drops one folder's presentation on one host. A host without the scope has none to drop. */
async function deleteHostTagSetting(
	url: string,
	scope: string,
	tag: string,
): Promise<void> {
	const client = getHostServiceClientByUrl(url);
	try {
		await client.tagFolders.delete.mutate({ scope, tag });
	} catch (error) {
		if (hasErrorCode(error, "NOT_FOUND")) return;
		if (scope === SESSIONS_TAG_SCOPE || !isMissingProcedureError(error)) {
			throw error;
		}
		try {
			await client.project.deleteTagSetting.mutate({ projectId: scope, tag });
		} catch (legacyError) {
			if (!hasErrorCode(legacyError, "NOT_FOUND")) throw legacyError;
		}
	}
}

/**
 * Stored folders that no workspace carries the tag of, and the purge that
 * removes their presentation: the local row and the host
 * `tag_folder_settings` row. It never changes a workspace's tags, so a
 * folder that comes back later is a new, plain one.
 */
export function useEmptySidebarFolders() {
	const collections = useCollections();
	const {
		workspaces: hostWorkspaces,
		hostReads,
		rosterLive,
		cache,
	} = useHostWorkspaces();
	const { workspaces: cloudWorkspaces, isLive: cloudLive } =
		useCloudWorkspaces();
	const { projects: hostProjects, hostResults: projectHostResults } =
		useHostProjects();
	const { activeHostUrl } = useLocalHostService();
	const tagFolderContext = useTagFolderContext();

	const { data: sections = [] } = useLiveQuery(
		(q) =>
			q
				.from({ sidebarSections: collections.v2SidebarSections })
				.select(({ sidebarSections }) => ({
					sectionId: sidebarSections.sectionId,
					projectId: sidebarSections.projectId,
					name: sidebarSections.name,
					tag: sidebarSections.tag,
				})),
		[collections],
	);
	const { data: placements = [] } = useLiveQuery(
		(q) =>
			q
				.from({ rows: collections.v2WorkspaceLocalState })
				.select(({ rows }) => ({
					workspaceId: rows.workspaceId,
					projectId: rows.sidebarState.projectId,
				})),
		[collections],
	);

	const findInput = useMemo<FindOrphanedTagFoldersInput>(() => {
		const placedProjectIdById = new Map(
			placements.map((row) => [row.workspaceId, row.projectId]),
		);
		const projectIdsByHost = new Map(
			projectHostResults.map((result) => [
				result.target.machineId,
				result.rows?.map((project) => project.id) ?? null,
			]),
		);
		const projectsLiveByHost = new Map(
			projectHostResults.map((result) => [
				result.target.machineId,
				result.listLive,
			]),
		);
		return {
			sections,
			workspaces: [
				...hostWorkspaces
					.filter((workspace) => !cache.isSandboxHost(workspace.hostId))
					.map((workspace) => ({
						id: workspace.id,
						projectId: workspace.projectId,
						tags: workspace.tags,
					})),
				...(cloudWorkspaces ?? []).map((workspace) => ({
					id: workspace.id,
					projectId: placedProjectIdById.get(workspace.id),
					tags: workspace.tags,
				})),
			],
			hostReads: hostReads.map((read) => ({
				isLocal: read.isLocal,
				live: read.live,
				projectIds: projectIdsByHost.get(read.machineId) ?? null,
				projectsLive: projectsLiveByHost.get(read.machineId) ?? false,
			})),
			rosterLive,
			cloudLive,
			hiddenTagsByProject: tagFolderContext.hiddenTagsByProject,
			sessionsSettingHostKnown: activeHostUrl !== null,
		};
	}, [
		activeHostUrl,
		cache,
		cloudLive,
		cloudWorkspaces,
		hostReads,
		hostWorkspaces,
		placements,
		projectHostResults,
		rosterLive,
		sections,
		tagFolderContext.hiddenTagsByProject,
	]);

	const groupFolders = useCallback(
		(folders: readonly OrphanedTagFolder[]): FolderGroup[] => {
			const groups = new Map<string, FolderGroup>();
			for (const folder of folders) {
				const key = `${folder.scope}\u0000${folder.tag}`;
				const existing = groups.get(key);
				if (existing) {
					existing.sectionIds.push(folder.sectionId);
					continue;
				}
				const setting = tagFolderContext.tagSettings.find(
					(item) =>
						item.projectId === folder.scope &&
						normalizeWorkspaceTag(item.tag) === folder.tag,
				);
				groups.set(key, {
					sectionIds: [folder.sectionId],
					folder: {
						scope: folder.scope,
						projectId: laneProjectIdForScope(folder.scope),
						projectName:
							hostProjects.find(
								(project) => project.projectKey === folder.scope,
							)?.name ?? null,
						tag: folder.tag,
						name: setting?.displayName ?? folder.name,
					},
				});
			}
			return [...groups.values()];
		},
		[hostProjects, tagFolderContext.tagSettings],
	);

	const toSkipped = useCallback(
		(folders: readonly UnverifiedTagFolder[]): SkippedSidebarFolder[] =>
			groupFolders(folders).map(({ folder }) => ({
				...folder,
				reason:
					folders.find(
						(item) => item.scope === folder.scope && item.tag === folder.tag,
					)?.reason ?? "unanswered",
			})),
		[groupFolders],
	);

	const { emptyFolders, unverifiedFolders } = useMemo(() => {
		const found = findOrphanedTagFolders(findInput);
		return {
			emptyFolders: groupFolders(found.orphaned).map(({ folder }) => folder),
			unverifiedFolders: toSkipped(found.unverified),
		};
	}, [findInput, groupFolders, toSkipped]);

	/**
	 * A project's folders live on every host serving it; Sessions folders on
	 * the active host. Null when one of those hosts cannot be reached, so the
	 * caller never reads "no hosts" as "nothing to delete".
	 */
	const resolveSettingHostUrls = useCallback(
		(scope: string): string[] | null => {
			if (scope === SESSIONS_TAG_SCOPE) {
				return activeHostUrl ? [activeHostUrl] : null;
			}
			const project = hostProjects.find((item) => item.projectKey === scope);
			const urls = (project?.hostIds ?? []).map((hostId) =>
				cache.resolveHostUrl(hostId),
			);
			return urls.every((url): url is string => url != null) ? urls : null;
		},
		[activeHostUrl, cache, hostProjects],
	);

	const organizationId = useActiveOrganizationId();
	const cloudUtils = cloudTrpc.useUtils();
	const queryClient = useQueryClient();
	// A prune refetches stale sources and decides from the render that
	// carries their data, so it reads everything through this ref.
	const latest: FolderPruneSnapshot & { cache: typeof cache } = {
		organizationId,
		findInput,
		cache,
		groupFolders,
		resolveSettingHostUrls,
		toSkipped,
	};
	const latestRef = useRef(latest);
	// After commit, so an in-flight prune only ever reads committed data.
	useLayoutEffect(() => {
		latestRef.current = latest;
	});

	const removeEmptyFolders = useCallback(
		({
			projectId,
			dryRun = false,
		}: RemoveEmptySidebarFoldersOptions = {}): Promise<RemoveEmptySidebarFoldersResult> =>
			runFolderPrune({
				projectId,
				dryRun,
				readLatest: () => latestRef.current,
				refresh: () =>
					refreshPruneSources({
						current: latestRef.current.findInput,
						readLatest: () => latestRef.current.findInput,
						refetch: {
							roster: () => cloudUtils.host.roster.refetch(),
							cloud: () => cloudUtils.cloudWorkspace.list.refetch(),
							hosts: () =>
								Promise.all([
									latestRef.current.cache.refetchAll(),
									queryClient.refetchQueries({
										queryKey: ["host-service", "projects", "list"],
									}),
								]),
						},
						timeoutMs: SOURCE_REFETCH_TIMEOUT_MS,
						settleMs: SOURCE_SETTLE_MS,
						pollMs: SOURCE_POLL_MS,
					}),
				deleteHostSetting: deleteHostTagSetting,
				// These collections belong to the organization this callback was
				// made for, even after the window switches.
				deleteRows: (sectionIds) => {
					for (const sectionId of sectionIds) {
						if (collections.v2SidebarSections.get(sectionId)) {
							collections.v2SidebarSections.delete(sectionId);
						}
					}
				},
			}),
		[cloudUtils, collections, queryClient],
	);

	return { emptyFolders, unverifiedFolders, removeEmptyFolders };
}
