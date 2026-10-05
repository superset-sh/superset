import { useLingui } from "@lingui/react/macro";
import { prompt } from "@superset/alert-prompt";
import {
	type ProjectCollectionSummary,
	resolveProjectCollections,
} from "@superset/shared/project-collections";
import {
	mintFolderTag,
	PROJECTS_TAG_SCOPE,
} from "@superset/shared/workspace-tags";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { Alert } from "react-native";
import {
	type HostProjectItem,
	hostProjectsQueryKey,
} from "@/hooks/useHostProjects";
import type { WorkspacesHost } from "@/hooks/useHostWorkspaces";
import {
	getHostServiceClientByUrl,
	type HostProjectRow,
	type HostTagFolderRow,
	hostServiceUrl,
} from "@/lib/host-service/client";
import {
	nextCollectionTabOrder,
	withCollectionSetting,
	withProjectTags,
} from "./utils/patchCollectionCache";

const SETTINGS_REFETCH_INTERVAL_MS = 30_000;
const COLLECTION_NAME_MAX_LENGTH = 200;

const NO_COLLECTIONS = {
	collections: [] as ProjectCollectionSummary[],
	collectionByProjectId: new Map<string, ProjectCollectionSummary>(),
};

/**
 * The selected host's project collections: project tags plus its `projects`
 * tag folder settings. A host that predates project tags has none, and its
 * projects offer no collection actions.
 */
export function useProjectCollections(
	host: WorkspacesHost | null,
	projects: HostProjectItem[],
) {
	const { t } = useLingui();
	const queryClient = useQueryClient();
	const hostUrl = host
		? hostServiceUrl(host.organizationId, host.machineId)
		: null;
	const supported = projects.some((project) => project.supportsCollections);
	const projectsKey = useMemo(() => hostProjectsQueryKey(host), [host]);
	const settingsKey = useMemo(
		() => ["host-service", "tagFolders", "list", host?.machineId, hostUrl],
		[host?.machineId, hostUrl],
	);

	const settingsQuery = useQuery({
		queryKey: settingsKey,
		enabled: hostUrl !== null && (host?.isOnline ?? false),
		// A host that predates project tags may not serve this router at all.
		refetchInterval: supported ? SETTINGS_REFETCH_INTERVAL_MS : false,
		networkMode: "always" as const,
		retry: supported ? 1 : 0,
		queryFn: async () => {
			if (!hostUrl) return [];
			return getHostServiceClientByUrl(hostUrl).tagFolders.list.query();
		},
	});

	const settings = useMemo(
		() =>
			(settingsQuery.data ?? []).filter(
				(row) => row.scope === PROJECTS_TAG_SCOPE,
			),
		[settingsQuery.data],
	);

	const { collections, collectionByProjectId } = useMemo(
		() =>
			supported
				? resolveProjectCollections({ projects, settings })
				: NO_COLLECTIONS,
		[supported, projects, settings],
	);

	const failed = useCallback(
		() => Alert.alert(t({ message: "Could not update collection" })),
		[t],
	);

	const moveProject = useCallback(
		async (projectId: string, tag: string | null) => {
			if (!hostUrl) return;
			const tags = tag ? [tag] : [];
			await queryClient.cancelQueries({ queryKey: projectsKey });
			const previousTags = queryClient
				.getQueryData<HostProjectRow[]>(projectsKey)
				?.find((row) => row.id === projectId)?.tags;
			queryClient.setQueryData<HostProjectRow[]>(projectsKey, (rows) =>
				withProjectTags(rows, projectId, tags),
			);
			try {
				await getHostServiceClientByUrl(hostUrl).project.setTags.mutate({
					projectId,
					tags,
				});
			} catch {
				if (previousTags)
					queryClient.setQueryData<HostProjectRow[]>(projectsKey, (rows) =>
						withProjectTags(rows, projectId, previousTags),
					);
				failed();
			} finally {
				void queryClient.invalidateQueries({ queryKey: projectsKey });
			}
		},
		[hostUrl, queryClient, projectsKey, failed],
	);

	const createCollection = useCallback(
		async (projectId: string, name: string) => {
			const displayName = name.trim().slice(0, COLLECTION_NAME_MAX_LENGTH);
			if (!hostUrl || !displayName) return;
			const client = getHostServiceClientByUrl(hostUrl);
			const tag = mintFolderTag(
				displayName,
				collections.map((collection) => collection.tag),
			);
			const setting: HostTagFolderRow = {
				scope: PROJECTS_TAG_SCOPE,
				tag,
				displayName,
				color: null,
				tabOrder: nextCollectionTabOrder(settings),
			};
			await Promise.all([
				queryClient.cancelQueries({ queryKey: projectsKey }),
				queryClient.cancelQueries({ queryKey: settingsKey }),
			]);
			const previousTags = queryClient
				.getQueryData<HostProjectRow[]>(projectsKey)
				?.find((row) => row.id === projectId)?.tags;
			queryClient.setQueryData<HostTagFolderRow[]>(settingsKey, (rows) =>
				withCollectionSetting(rows, setting),
			);
			queryClient.setQueryData<HostProjectRow[]>(projectsKey, (rows) =>
				withProjectTags(rows, projectId, [tag]),
			);
			let settingSaved = false;
			try {
				await client.tagFolders.upsert.mutate(setting);
				settingSaved = true;
				await client.project.setTags.mutate({ projectId, tags: [tag] });
			} catch {
				if (previousTags)
					queryClient.setQueryData<HostProjectRow[]>(projectsKey, (rows) =>
						withProjectTags(rows, projectId, previousTags),
					);
				queryClient.setQueryData<HostTagFolderRow[]>(settingsKey, (rows) =>
					rows?.filter(
						(row) => row.scope !== PROJECTS_TAG_SCOPE || row.tag !== tag,
					),
				);
				if (settingSaved)
					void client.tagFolders.delete
						.mutate({ scope: PROJECTS_TAG_SCOPE, tag })
						.catch(() => {});
				failed();
			} finally {
				void queryClient.invalidateQueries({ queryKey: projectsKey });
				void queryClient.invalidateQueries({ queryKey: settingsKey });
			}
		},
		[
			hostUrl,
			collections,
			settings,
			queryClient,
			projectsKey,
			settingsKey,
			failed,
		],
	);

	const newCollection = useCallback(
		async (projectId: string) => {
			const name = await prompt({
				title: t({ message: "New collection" }),
				placeholder: t({ message: "Collection name" }),
				confirmText: t({ message: "Create" }),
			});
			if (name?.trim()) await createCollection(projectId, name);
		},
		[t, createCollection],
	);

	return {
		collections,
		collectionByProjectId,
		isSuccess: settingsQuery.isSuccess,
		/** True once the settings answered or failed; tags alone still group. */
		isReady:
			!supported ||
			settingsQuery.isSuccess ||
			settingsQuery.isError ||
			host?.isOnline === false,
		moveProject,
		newCollection,
	};
}
