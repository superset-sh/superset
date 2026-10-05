import { PROJECTS_TAG_SCOPE } from "@superset/shared/workspace-tags";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import {
	getHostProjectsQueryKey,
	type HostProjectRow,
} from "renderer/hooks/host-projects/useHostProjects/useHostProjects.utils";
import { useHostTagFolders } from "renderer/hooks/host-projects/useHostTagFolders";
import type { HostTagFolderSetting } from "renderer/hooks/host-projects/useHostTagFolders/useHostTagFolders.utils";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { isMissingProcedureError } from "renderer/lib/isMissingProcedureError";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type {
	ProjectCollectionPendingDelete,
	ProjectCollectionPendingPresentation,
	ProjectCollectionPlacement,
} from "shared/project-collections";
import {
	derivePlacedProjectCollections,
	getProjectCollectionOrder,
	resolveProjectCollectionPlacements,
} from "../../utils/projectCollections/projectCollectionOrder";
import {
	enqueueProjectCollectionMutation,
	mutateProjectCollection,
	type ProjectCollectionCommand,
	type ProjectCollectionMutationState,
} from "./projectCollectionMutations";
import {
	replayProjectCollectionDeletes,
	withoutPendingProjectCollections,
} from "./replayProjectCollectionDeletes";
import {
	replayProjectCollectionPresentations,
	withPendingProjectCollectionPresentations,
} from "./utils/replayProjectCollectionPresentations";

const EMPTY_PENDING_DELETES: ProjectCollectionPendingDelete[] = [];
const EMPTY_PENDING_PRESENTATIONS: ProjectCollectionPendingPresentation[] = [];

export function useProjectCollectionsState() {
	const projects = useHostProjects();
	const folders = useHostTagFolders();
	const { workspaces, isReady: workspacesReady } = useHostWorkspaces();
	const collections = useCollections();
	const { data: sidebarProjects = [] } = useLiveQuery(
		(q) => q.from({ row: collections.v2SidebarProjects }),
		[collections],
	);
	const { preferences, setHideEmptyProjectCollections } =
		useV2UserPreferences();
	const { activeOrganizationId } = useLocalHostService();
	const { data: session } = authClient.useSession();
	const userId = session?.user.id ?? "";
	const scope = useMemo(
		() => ({ organizationId: activeOrganizationId ?? "", userId }),
		[activeOrganizationId, userId],
	);
	const scopeKey = `${scope.organizationId}\u0000${scope.userId}`;
	const enabled = !!scope.organizationId && !!scope.userId;
	const placementsQuery = electronTrpc.projectCollections.list.useQuery(scope, {
		enabled,
	});
	const pendingQuery = electronTrpc.projectCollections.pendingDeletes.useQuery(
		scope,
		{
			enabled,
			refetchInterval: 60_000,
		},
	);
	const acknowledge =
		electronTrpc.projectCollections.acknowledgeDeletes.useMutation();
	const presentationsQuery =
		electronTrpc.projectCollections.pendingPresentations.useQuery(scope, {
			enabled,
			refetchInterval: 60_000,
		});
	const acknowledgePresentation =
		electronTrpc.projectCollections.acknowledgePresentations.useMutation();
	const pendingPresentations =
		presentationsQuery.data ?? EMPTY_PENDING_PRESENTATIONS;
	const pendingDeletes = pendingQuery.data ?? EMPTY_PENDING_DELETES;
	const [optimisticFolders, setOptimisticFolders] = useState<{
		scopeKey: string;
		hosts: typeof folders.hostResults;
	} | null>(null);
	const folderHosts = useMemo(
		() =>
			withPendingProjectCollectionPresentations(
				withoutPendingProjectCollections(
					optimisticFolders?.scopeKey === scopeKey
						? optimisticFolders.hosts
						: folders.hostResults,
					pendingDeletes,
				),
				pendingPresentations,
			),
		[
			folders.hostResults,
			pendingDeletes,
			pendingPresentations,
			optimisticFolders,
			scopeKey,
		],
	);
	const write = electronTrpc.projectCollections.write.useMutation();
	const reconcile = electronTrpc.projectCollections.reconcile.useMutation();
	const utils = electronTrpc.useUtils();
	const queryClient = useQueryClient();
	const placements: ProjectCollectionPlacement[] = placementsQuery.data ?? [];
	const current = useRef<ProjectCollectionMutationState>({
		projectHosts: projects.hostResults,
		folderHosts,
		placements,
	});
	current.current = {
		projectHosts: projects.hostResults,
		folderHosts,
		placements,
	};
	const view = useMemo(
		() =>
			derivePlacedProjectCollections({
				projects: projects.projects,
				hostResults: folderHosts,
				placements,
				sidebarProjects,
				workspaces,
				sortMode: preferences.sidebarProjectSortMode,
				hideEmpty: preferences.hideEmptyProjectCollections,
			}),
		[
			projects.projects,
			folderHosts,
			placements,
			sidebarProjects,
			workspaces,
			preferences.sidebarProjectSortMode,
			preferences.hideEmptyProjectCollections,
		],
	);
	const replayKey = JSON.stringify([
		scopeKey,
		pendingQuery.dataUpdatedAt,
		pendingDeletes.map(({ machineId, tag }) => [machineId, tag]),
		folders.hostResults.map(({ target, status }) => [
			target.machineId,
			target.hostUrl,
			status,
		]),
	]);
	const lastReplay = useRef("");
	useEffect(() => {
		if (
			!enabled ||
			!pendingQuery.isSuccess ||
			!pendingDeletes.length ||
			lastReplay.current === replayKey
		)
			return;
		lastReplay.current = replayKey;
		void replayProjectCollectionDeletes({
			hosts: folders.hostResults,
			enqueue: (work) => enqueueProjectCollectionMutation(scopeKey, work),
			readPending: () =>
				utils.projectCollections.pendingDeletes.getData(scope) ?? [],
			invalidate: (host) => {
				void queryClient.invalidateQueries({
					queryKey: [
						"host-tag-folders",
						host.target.organizationId,
						host.target.machineId,
					],
				});
			},
			pending: utils.projectCollections.pendingDeletes.getData(scope) ?? [],
			remove: async (url, tag, deletedAt) => {
				const response = await getHostServiceClientByUrl(
					url,
				).tagFolders.delete.mutate({
					scope: PROJECTS_TAG_SCOPE,
					tag,
					deletedAt,
				});
				const host = folders.hostResults.find(
					(host) => host.target.hostUrl === url,
				);
				if (host)
					queryClient.setQueryData<HostTagFolderSetting[]>(
						[
							"host-tag-folders",
							host.target.organizationId,
							host.target.machineId,
						],
						(settings) => [
							...(settings ?? []).filter(
								(setting) => setting.scope !== PROJECTS_TAG_SCOPE,
							),
							...response.tagSettings.map((setting) => ({
								...setting,
								scope: PROJECTS_TAG_SCOPE,
							})),
						],
					);
			},
			acknowledge: async (row) => {
				await acknowledge.mutateAsync({ ...scope, rows: [row] });
				utils.projectCollections.pendingDeletes.setData(scope, (rows) =>
					rows?.filter(
						(entry) =>
							entry.machineId !== row.machineId ||
							entry.tag !== row.tag ||
							entry.deletedAt !== row.deletedAt,
					),
				);
			},
		}).catch(() => undefined);
	}, [
		enabled,
		pendingQuery.isSuccess,
		pendingDeletes,
		replayKey,
		folders.hostResults,
		scopeKey,
		scope,
		utils,
		queryClient,
		acknowledge,
	]);
	const presentationRetries = useRef(
		new Map<string, { attempts: number; retryAt: number }>(),
	);
	const presentationReplayRunning = useRef(false);
	const presentationReplaySeen = useRef(new Set<string>());
	const [retryTick, setRetryTick] = useState(0);
	const [replayCompletion, setReplayCompletion] = useState(0);
	const presentationReplaySignals = useMemo(
		() => ({
			pending: pendingPresentations,
			hosts: folders.hostResults,
			revision: [retryTick, replayCompletion],
		}),
		[pendingPresentations, folders.hostResults, retryTick, replayCompletion],
	);
	const presentationReplayKey = JSON.stringify([
		scopeKey,
		retryTick,
		folders.hostResults.map(({ target, status }) => [
			target.machineId,
			target.hostUrl,
			status,
		]),
	]);
	const lastPresentationReplay = useRef("");
	useEffect(() => {
		const { pending: pendingPresentations, hosts } = presentationReplaySignals;
		if (
			!enabled ||
			!presentationsQuery.isSuccess ||
			!pendingPresentations.length ||
			presentationReplayRunning.current ||
			(lastPresentationReplay.current === presentationReplayKey &&
				pendingPresentations.every((row) =>
					presentationReplaySeen.current.has(JSON.stringify(row)),
				))
		)
			return;
		if (lastPresentationReplay.current !== presentationReplayKey)
			presentationReplaySeen.current.clear();
		lastPresentationReplay.current = presentationReplayKey;
		presentationReplayRunning.current = true;
		presentationReplaySeen.current = new Set(
			pendingPresentations.map((row) => JSON.stringify(row)),
		);
		void replayProjectCollectionPresentations({
			hosts,
			retries: presentationRetries.current,
			readHost: (host) => ({
				...host,
				settings:
					queryClient.getQueryData<HostTagFolderSetting[]>([
						"host-tag-folders",
						host.target.organizationId,
						host.target.machineId,
					]) ?? host.settings,
			}),
			pending: pendingPresentations,
			readPending: () =>
				utils.projectCollections.pendingPresentations.getData(scope) ?? [],
			enqueue: (work) => enqueueProjectCollectionMutation(scopeKey, work),
			upsert: async (host, row) => {
				const response = await getHostServiceClientByUrl(
					host.target.hostUrl as string,
				)
					.tagFolders.replayPresentation.mutate(row.setting)
					.catch((error) => {
						if (!isMissingProcedureError(error)) throw error;
						return null;
					});
				if (!response) return;
				const queryKey = [
					"host-tag-folders",
					host.target.organizationId,
					host.target.machineId,
				];
				queryClient.setQueryData<HostTagFolderSetting[]>(
					queryKey,
					(settings) => [
						...(settings ?? host.settings).filter(
							(setting) =>
								setting.scope !== PROJECTS_TAG_SCOPE || setting.tag !== row.tag,
						),
						...(response.tagSettings ?? [])
							.filter((setting) => setting.tag === row.tag)
							.map((setting) => ({ scope: PROJECTS_TAG_SCOPE, ...setting })),
					],
				);
			},
			acknowledge: async (row) => {
				await acknowledgePresentation.mutateAsync({ ...scope, rows: [row] });
				utils.projectCollections.pendingPresentations.setData(scope, (rows) =>
					rows?.filter(
						(entry) =>
							entry.machineId !== row.machineId ||
							entry.tag !== row.tag ||
							JSON.stringify(entry.setting) !== JSON.stringify(row.setting),
					),
				);
			},
			invalidate: (host) => {
				void queryClient.invalidateQueries({
					queryKey: [
						"host-tag-folders",
						host.target.organizationId,
						host.target.machineId,
					],
				});
			},
		})
			.catch(() => undefined)
			.finally(() => {
				presentationReplayRunning.current = false;
				setReplayCompletion((value) => value + 1);
			});
	}, [
		enabled,
		presentationsQuery.isSuccess,
		presentationReplaySignals,
		presentationReplayKey,
		scope,
		scopeKey,
		utils,
		queryClient,
		acknowledgePresentation,
	]);
	useEffect(() => {
		const { pending: pendingPresentations, hosts } = presentationReplaySignals;
		const retryAt = Math.min(
			...[...presentationRetries.current.entries()]
				.filter(
					([machineId]) =>
						pendingPresentations.some((row) => row.machineId === machineId) &&
						hosts.some(
							(host) =>
								host.target.machineId === machineId &&
								host.target.hostUrl &&
								(host.status === "ready" || host.status === "error"),
						),
				)
				.map(([, row]) => row.retryAt),
		);
		if (!Number.isFinite(retryAt) || !pendingPresentations.length) return;
		const timer = setTimeout(
			() => setRetryTick((tick) => tick + 1),
			Math.max(1000, retryAt - Date.now()),
		);
		return () => clearTimeout(timer);
	}, [presentationReplaySignals]);
	const knownKeys = [
		...projects.projects.map((project) => project.id),
		...view.collections.map((collection) => collection.id),
	]
		.sort()
		.join("\u0000");
	const canReconcile =
		enabled &&
		pendingQuery.isSuccess &&
		presentationsQuery.isSuccess &&
		projects.isReady &&
		folders.isReady &&
		projects.hostResults.every((host) => host.reachable) &&
		folders.hostResults.every((host) => host.status === "ready");
	const lastReconciled = useRef("");
	useEffect(() => {
		const identity = `${scope.organizationId}\u0000${scope.userId}\u0000${knownKeys}`;
		if (!canReconcile || lastReconciled.current === identity) return;
		lastReconciled.current = identity;
		const keys = [
			...new Set([
				...current.current.projectHosts.flatMap((host) =>
					(host.rows ?? []).map((row) => row.id),
				),
				...current.current.projectHosts.flatMap((host) =>
					(host.rows ?? []).flatMap((row) =>
						(row.tags ?? []).map((tag) => `${PROJECTS_TAG_SCOPE}:${tag}`),
					),
				),
				...current.current.folderHosts.flatMap((host) =>
					host.settings
						.filter((row) => row.scope === PROJECTS_TAG_SCOPE)
						.map((row) => `${PROJECTS_TAG_SCOPE}:${row.tag}`),
				),
			]),
		];
		if (!keys.length) return;
		void enqueueProjectCollectionMutation(scopeKey, async () => {
			await reconcile.mutateAsync({ ...scope, keys });
			await utils.projectCollections.list.invalidate(scope);
		}).catch(() => {
			lastReconciled.current = "";
		});
	}, [canReconcile, knownKeys, scope, scopeKey, reconcile, utils]);
	const mutate = useCallback(
		async (command: ProjectCollectionCommand) => {
			if (
				!enabled ||
				!placementsQuery.isSuccess ||
				!pendingQuery.isSuccess ||
				!presentationsQuery.isSuccess
			)
				return false;
			return enqueueProjectCollectionMutation(scopeKey, async () => {
				const localOnly =
					command.type === "collapse" || command.type === "reorder";

				await Promise.all([
					...(localOnly ? [] : current.current.projectHosts).map((host) =>
						queryClient.cancelQueries({
							queryKey: getHostProjectsQueryKey(host.target, userId),
						}),
					),
					...(localOnly ? [] : current.current.folderHosts).map((host) =>
						queryClient.cancelQueries({
							queryKey: [
								"host-tag-folders",
								host.target.organizationId,
								host.target.machineId,
							],
						}),
					),
					utils.projectCollections.list.cancel(scope),
				]);
				const baseline: ProjectCollectionMutationState = {
					projectHosts: current.current.projectHosts.map((host) => ({
						...host,
						rows:
							queryClient.getQueryData<HostProjectRow[]>(
								getHostProjectsQueryKey(host.target, userId),
							) ?? host.rows,
					})),
					folderHosts: withPendingProjectCollectionPresentations(
						withoutPendingProjectCollections(
							current.current.folderHosts.map((host) => ({
								...host,
								settings:
									queryClient.getQueryData<HostTagFolderSetting[]>([
										"host-tag-folders",
										host.target.organizationId,
										host.target.machineId,
									]) ?? host.settings,
							})),
							utils.projectCollections.pendingDeletes.getData(scope) ?? [],
						),
						utils.projectCollections.pendingPresentations.getData(scope) ?? [],
					),
					placements:
						utils.projectCollections.list.getData(scope) ??
						current.current.placements,
				};
				return mutateProjectCollection(
					{
						read: () => ({
							...baseline,
							placements: resolveProjectCollectionPlacements({
								projectIds: [
									...new Set(
										baseline.projectHosts.flatMap((host) =>
											(host.rows ?? []).map((row) => row.id),
										),
									),
								],
								sidebarProjects,
								placements: baseline.placements,
							}),
						}),
						publish: (state) => {
							current.current = state;
							if (!localOnly)
								setOptimisticFolders({ scopeKey, hosts: state.folderHosts });
							for (const host of localOnly ? [] : state.projectHosts)
								queryClient.setQueryData<HostProjectRow[]>(
									getHostProjectsQueryKey(host.target, userId),
									host.rows,
								);
							for (const host of localOnly
								? []
								: state.folderHosts.filter((host) => host.status === "ready"))
								queryClient.setQueryData<HostTagFolderSetting[]>(
									[
										"host-tag-folders",
										host.target.organizationId,
										host.target.machineId,
									],
									host.settings,
								);
							utils.projectCollections.list.setData(
								scope,
								state.placements.map((row) => ({ ...row, ...scope })),
							);
						},
						setTags: async (url, updates) => {
							const client = getHostServiceClientByUrl(url);
							if (updates.length === 1)
								return client.project.setTags.mutate(
									updates[0] as (typeof updates)[number],
								);
							try {
								return await client.project.setTagsBatch.mutate({ updates });
							} catch (error) {
								if (!isMissingProcedureError(error)) throw error;
								const prior = baseline.projectHosts.find(
									(host) => host.target.hostUrl === url,
								);
								const settled = await Promise.allSettled(
									updates.map((update) =>
										client.project.setTags.mutate(update),
									),
								);
								const failure = settled.find(
									(result) => result.status === "rejected",
								);
								if (failure?.status === "rejected") {
									await Promise.allSettled(
										updates
											.filter(
												(_, index) => settled[index]?.status === "fulfilled",
											)
											.map((update) =>
												client.project.setTags.mutate({
													projectId: update.projectId,
													tags:
														prior?.rows?.find(
															(row) => row.id === update.projectId,
														)?.tags ?? [],
												}),
											),
									);
									throw failure.reason;
								}
								return settled;
							}
						},
						setSetting: (url, tag, setting, deletedAt) =>
							setting
								? getHostServiceClientByUrl(url).tagFolders.upsert.mutate(
										setting,
									)
								: getHostServiceClientByUrl(url).tagFolders.delete.mutate({
										scope: PROJECTS_TAG_SCOPE,
										tag,
										deletedAt,
									}),
						writePlacements: async (
							rows,
							removeKeys,
							pendingDeletes,
							removePendingDeleteTags,
							pendingPresentations,
							clearPendingSettings,
						) => {
							await write.mutateAsync({
								...scope,
								rows,
								removeKeys,
								pendingDeletes,
								removePendingDeleteTags,
								pendingPresentations,
								clearPendingSettings,
							});
							const matches = (
								row: ProjectCollectionPendingDelete,
								changes: ProjectCollectionPendingDelete[] | undefined,
							) =>
								changes?.some(
									(change) =>
										change.machineId === row.machineId &&
										change.tag === row.tag,
								);
							if (
								pendingDeletes?.length ||
								pendingPresentations?.length ||
								removePendingDeleteTags?.length ||
								clearPendingSettings?.length
							) {
								utils.projectCollections.pendingDeletes.setData(scope, [
									...(
										utils.projectCollections.pendingDeletes.getData(scope) ?? []
									).filter(
										(row) =>
											!removePendingDeleteTags?.includes(row.tag) &&
											!matches(row, clearPendingSettings) &&
											!matches(row, pendingDeletes) &&
											!matches(row, pendingPresentations),
									),
									...(pendingDeletes ?? []).map((row) => ({
										...scope,
										...row,
									})),
								]);
								utils.projectCollections.pendingPresentations.setData(scope, [
									...(
										utils.projectCollections.pendingPresentations.getData(
											scope,
										) ?? []
									).filter(
										(row) =>
											!matches(row, clearPendingSettings) &&
											!matches(row, pendingDeletes) &&
											!matches(row, pendingPresentations),
									),
									...(pendingPresentations ?? []).map((row) => ({
										...scope,
										...row,
									})),
								]);
								await Promise.allSettled([
									utils.projectCollections.pendingDeletes.invalidate(scope),
									utils.projectCollections.pendingPresentations.invalidate(
										scope,
									),
								]);
							}
						},
						invalidate: async () => {
							const refreshes: Promise<unknown>[] = [];
							for (const host of command.type === "move" ||
							command.type === "delete" ||
							(command.type === "create" && command.projectIds?.length) ||
							(command.type === "rename" && command.replacementTag)
								? baseline.projectHosts
								: [])
								refreshes.push(
									queryClient.invalidateQueries({
										queryKey: getHostProjectsQueryKey(host.target, userId),
									}),
								);
							for (const host of command.type === "move"
								? []
								: baseline.folderHosts)
								refreshes.push(
									queryClient.invalidateQueries({
										queryKey: [
											"host-tag-folders",
											host.target.organizationId,
											host.target.machineId,
										],
									}),
								);
							refreshes.push(utils.projectCollections.list.invalidate(scope));
							await Promise.allSettled(refreshes);
						},
					},
					command,
				).finally(() => setOptimisticFolders(null));
			});
		},
		[
			enabled,
			placementsQuery.isSuccess,
			pendingQuery.isSuccess,
			presentationsQuery.isSuccess,
			scope,
			scopeKey,
			queryClient,
			utils,
			write,
			sidebarProjects,
			userId,
		],
	);
	const projectOrder = useMemo(
		() => getProjectCollectionOrder(view.rootItems),
		[view.rootItems],
	);
	const canMoveProject = useCallback(
		(projectId: string) =>
			projects.projects.find((project) => project.id === projectId)
				?.supportsProjectTags === true &&
			projects.hostResults
				.filter((host) => host.rows?.some((row) => row.id === projectId))
				.every((host) => host.reachable && host.target.hostUrl !== null),
		[projects.projects, projects.hostResults],
	);
	const canDeleteCollection = useCallback(
		(tag: string) =>
			projects.projects
				.filter((project) => project.tags?.includes(tag))
				.every((project) => canMoveProject(project.id)),
		[projects.projects, canMoveProject],
	);
	const isReady =
		projects.isReady &&
		folders.isReady &&
		workspacesReady &&
		placementsQuery.isSuccess &&
		pendingQuery.isSuccess &&
		presentationsQuery.isSuccess;
	return useMemo(
		() => ({
			...view,
			projectOrder,
			railProjectOrder: projectOrder,
			isReady,
			canMoveProject,
			canDeleteCollection,
			mutate,
			hideEmptyCollections: preferences.hideEmptyProjectCollections,
			setHideEmptyCollections: setHideEmptyProjectCollections,
		}),
		[
			view,
			projectOrder,
			isReady,
			canMoveProject,
			canDeleteCollection,
			mutate,
			preferences.hideEmptyProjectCollections,
			setHideEmptyProjectCollections,
		],
	);
}
