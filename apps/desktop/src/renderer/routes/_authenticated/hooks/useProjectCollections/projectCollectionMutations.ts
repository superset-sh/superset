import {
	normalizeWorkspaceTag,
	PROJECTS_TAG_SCOPE,
} from "@superset/shared/workspace-tags";
import type { HostProjectRowsResult } from "renderer/hooks/host-projects/useHostProjects/useHostProjects.utils";
import {
	type HostTagFolderSetting,
	type HostTagFoldersResult,
	mergeHostTagFolders,
} from "renderer/hooks/host-projects/useHostTagFolders/useHostTagFolders.utils";
import { isMissingProcedureError } from "renderer/lib/isMissingProcedureError";
import type {
	ProjectCollectionPendingDelete,
	ProjectCollectionPendingPresentation,
	ProjectCollectionPlacement,
} from "shared/project-collections";
import {
	deriveProjectCollections,
	projectCollectionId,
} from "../../utils/projectCollections/projectCollections";

export type ProjectCollectionCommand =
	| {
			type: "move";
			projectIds: string[];
			tag: string | null;
			index?: number;
			beforeKey?: string | null;
	  }
	| { type: "create"; tag: string; name: string; projectIds?: string[] }
	| { type: "rename"; tag: string; name: string; replacementTag?: string }
	| { type: "color"; tag: string; color: string | null }
	| { type: "delete"; tag: string }
	| { type: "collapse"; tag: string; isCollapsed: boolean }
	| { type: "reorder"; keys: string[] };

export interface ProjectCollectionMutationState {
	projectHosts: HostProjectRowsResult[];
	folderHosts: HostTagFoldersResult[];
	placements: ProjectCollectionPlacement[];
}

export interface ProjectCollectionMutationAdapter {
	read(): ProjectCollectionMutationState;
	publish(state: ProjectCollectionMutationState): void;
	setTags(
		hostUrl: string,
		updates: Array<{ projectId: string; tags: string[] }>,
	): Promise<unknown>;
	setSetting(
		hostUrl: string,
		tag: string,
		setting: HostTagFolderSetting | null,
		deletedAt?: number,
	): Promise<unknown>;
	writePlacements(
		rows: ProjectCollectionPlacement[],
		removeKeys: string[],
		pendingDeletes?: ProjectCollectionPendingDelete[],
		removePendingDeleteTags?: string[],
		pendingPresentations?: ProjectCollectionPendingPresentation[],
		clearPendingSettings?: ProjectCollectionPendingDelete[],
	): Promise<unknown>;
	invalidate(): void | Promise<void>;
}

const mutationQueues = new Map<string, Promise<unknown>>();

export function enqueueProjectCollectionMutation<T>(
	scope: string,
	work: () => Promise<T>,
): Promise<T> {
	const previous = mutationQueues.get(scope);
	const result = (previous ?? Promise.resolve())
		.catch(() => undefined)
		.then(work);
	const tail = result.catch(() => undefined);
	mutationQueues.set(scope, tail);
	void tail.then(() => {
		if (mutationQueues.get(scope) === tail) mutationQueues.delete(scope);
	});
	return result;
}

export function isUnsupportedProjectScope(error: unknown): boolean {
	if (isMissingProcedureError(error)) return true;
	if (!error || typeof error !== "object") return false;
	const { data, message } = error as {
		data?: { code?: string };
		message?: string;
	};
	return (
		data?.code === "BAD_REQUEST" &&
		typeof message === "string" &&
		/scope/.test(message) &&
		/uuid|sessions|invalid_union/i.test(message)
	);
}

function requiredTag(value: string): string {
	const tag = normalizeWorkspaceTag(value);
	if (!tag) throw new Error("Invalid collection tag");
	return tag;
}

export async function mutateProjectCollection(
	adapter: ProjectCollectionMutationAdapter,
	command: ProjectCollectionCommand,
): Promise<boolean> {
	const before = adapter.read();
	const next = structuredClone(before);
	const projectMap = new Map<
		string,
		{ id: string; name: string; tags: string[] }
	>();
	for (const host of before.projectHosts)
		for (const row of host.rows ?? []) {
			const previous = projectMap.get(row.id);
			projectMap.set(row.id, {
				id: row.id,
				name: row.name,
				tags: [...new Set([...(previous?.tags ?? []), ...(row.tags ?? [])])],
			});
		}
	const placements = new Map(
		next.placements
			.filter((row) => !row.key.startsWith("rail:"))
			.map((row) => [row.key, row]),
	);
	const view = deriveProjectCollections({
		projects: [...projectMap.values()],
		hostResults: before.folderHosts,
		placements: before.placements
			.filter((row) => row.kind === "collection")
			.map((row) => ({
				sectionId: row.key,
				projectId: PROJECTS_TAG_SCOPE,
				tag: row.key.slice(`${PROJECTS_TAG_SCOPE}:`.length),
				name: row.key,
				color: null,
				createdAt: new Date(0),
				tabOrder: row.tabOrder,
				isCollapsed: row.isCollapsed,
			})),
		projectPlacements: before.placements
			.filter((row) => row.kind === "project" && !row.key.startsWith("rail:"))
			.map((row) => ({
				projectId: row.key,
				isHidden: false,
				tabOrder: row.tabOrder,
			})),
	});
	const tag =
		"tag" in command && command.tag !== null ? requiredTag(command.tag) : null;
	const collection = tag
		? view.collections.find((row) => row.tag === tag)
		: undefined;
	const latestSetting = mergeHostTagFolders(before.folderHosts).find(
		(row) => row.scope === PROJECTS_TAG_SCOPE && row.tag === tag,
	);
	const replacementTag =
		command.type === "rename" && command.replacementTag
			? requiredTag(command.replacementTag)
			: null;
	if (
		replacementTag &&
		replacementTag !== tag &&
		view.collections.some((row) => row.tag === replacementTag)
	)
		return false;
	const projectIds =
		command.type === "move" || command.type === "create"
			? [...new Set(command.projectIds ?? [])]
			: command.type === "delete" ||
					(command.type === "rename" &&
						replacementTag !== null &&
						replacementTag !== tag)
				? [...projectMap.values()]
						.filter((project) => project.tags.includes(tag as string))
						.map((project) => project.id)
				: [];
	if (projectIds.some((id) => !projectMap.has(id))) return false;
	if (command.type === "move" && tag && !collection) return false;
	if (command.type === "create" && collection) return false;
	if (
		["rename", "color", "delete", "collapse"].includes(command.type) &&
		!collection
	)
		return false;
	for (const id of projectIds) {
		const hosts = before.projectHosts.filter((host) =>
			host.rows?.some((row) => row.id === id),
		);
		if (
			!hosts.length ||
			hosts.some(
				(host) =>
					!host.target.hostUrl ||
					!host.reachable ||
					!host.rows?.find((row) => row.id === id)?.supportsProjectTags,
			)
		)
			return false;
	}
	const settingWrite = ["create", "rename", "color", "delete"].includes(
		command.type,
	);
	const writableFolderHosts = next.folderHosts.filter(
		(host) => host.target.hostUrl && host.status === "ready",
	);
	if (settingWrite && !writableFolderHosts.length) return false;
	if (
		(command.type === "rename" || command.type === "create") &&
		(!command.name.trim() || command.name.trim().length > 200)
	)
		throw new Error("Invalid collection name");
	const tagWrites: Array<{
		url: string;
		updates: Array<{ projectId: string; tags: string[] }>;
		rollback: Array<{ projectId: string; tags: string[] }>;
	}> = [];
	for (const host of next.projectHosts) {
		const updates: Array<{ projectId: string; tags: string[] }> = [];
		const rollback: Array<{ projectId: string; tags: string[] }> = [];
		for (const row of host.rows ?? []) {
			if (!projectIds.includes(row.id)) continue;
			rollback.push({ projectId: row.id, tags: row.tags ?? [] });
			row.tags = replacementTag
				? (row.tags ?? []).map((entry) =>
						entry === tag ? replacementTag : entry,
					)
				: command.type === "delete"
					? view.collectionByProjectId.get(row.id)?.tag === tag
						? []
						: (row.tags ?? []).filter((entry) => entry !== tag)
					: tag === null
						? []
						: [tag];
			updates.push({ projectId: row.id, tags: row.tags });
		}
		if (updates.length && host.target.hostUrl)
			tagWrites.push({ url: host.target.hostUrl, updates, rollback });
	}
	const updatedAt = Math.max(
		Date.now(),
		...before.folderHosts.flatMap((host) =>
			host.settings
				.filter((row) => row.scope === PROJECTS_TAG_SCOPE)
				.map((row) => (row.updatedAt ?? 0) + 1),
		),
	);
	const pendingDeletes: ProjectCollectionPendingDelete[] = [];
	if (command.type === "delete" && tag)
		for (const host of next.folderHosts) {
			if (host.target.hostUrl && host.status === "ready") continue;
			const supportsProjectScope =
				host.settings.some((row) => row.scope === PROJECTS_TAG_SCOPE) ||
				next.projectHosts.some(
					(projects) =>
						projects.target.machineId === host.target.machineId &&
						projects.rows?.some((row) => row.supportsProjectTags === true),
				);
			if (host.status === "error" && !supportsProjectScope) continue;
			pendingDeletes.push({
				machineId: host.target.machineId,
				tag,
				deletedAt: updatedAt,
			});
			host.settings = host.settings.filter(
				(row) => row.scope !== PROJECTS_TAG_SCOPE || row.tag !== tag,
			);
		}
	const pendingPresentations: ProjectCollectionPendingPresentation[] = [];
	const clearPendingSettings: ProjectCollectionPendingDelete[] = [];
	const settingWrites: Array<{
		url: string;
		machineId: string;
		tag: string;
		setting: HostTagFolderSetting | null;
		rollback: HostTagFolderSetting | null;
	}> = [];
	if (settingWrite && tag)
		for (const host of next.folderHosts) {
			const prior =
				host.settings.find(
					(row) => row.scope === PROJECTS_TAG_SCOPE && row.tag === tag,
				) ?? null;
			const carriedCollection =
				prior !== null ||
				before.projectHosts.some(
					(projects) =>
						projects.target.machineId === host.target.machineId &&
						projects.rows?.some((row) => row.tags?.includes(tag)),
				);
			if (
				command.type !== "create" &&
				command.type !== "delete" &&
				!carriedCollection
			)
				continue;
			const writable = host.target.hostUrl && host.status === "ready";
			if (command.type === "delete" && !writable) continue;
			if (
				!writable &&
				host.status === "error" &&
				!carriedCollection &&
				command.type !== "create"
			)
				continue;
			const setting: HostTagFolderSetting | null =
				command.type === "delete"
					? null
					: {
							scope: PROJECTS_TAG_SCOPE,
							tag: replacementTag ?? tag,
							updatedAt,
							...(command.type === "create" ||
							(replacementTag !== null && replacementTag !== tag)
								? { create: true, createdAt: updatedAt }
								: prior?.create
									? { create: true, createdAt: prior.createdAt }
									: {}),
							displayName:
								command.type === "rename" || command.type === "create"
									? command.name.trim()
									: (collection?.name ?? prior?.displayName ?? null),
							color:
								command.type === "color"
									? command.color
									: (collection?.color ?? null),
							tabOrder:
								latestSetting?.tabOrder ??
								prior?.tabOrder ??
								collection?.tabOrder ??
								Math.max(0, ...view.rootItems.map((row) => row.tabOrder)) + 1,
						};
			host.settings = host.settings.filter(
				(row) => row.scope !== PROJECTS_TAG_SCOPE || row.tag !== tag,
			);
			if (setting) host.settings.push(setting);
			if (!writable) {
				if (setting)
					pendingPresentations.push({
						machineId: host.target.machineId,
						tag: setting.tag,
						setting: {
							...setting,
							scope: PROJECTS_TAG_SCOPE,
							create: setting.create === true,
						},
					});
				if (replacementTag && replacementTag !== tag)
					pendingDeletes.push({
						machineId: host.target.machineId,
						tag,
						deletedAt: updatedAt,
					});
				continue;
			}
			settingWrites.push({
				url: host.target.hostUrl as string,
				machineId: host.target.machineId,
				tag: replacementTag ?? tag,
				setting,
				rollback: replacementTag && replacementTag !== tag ? null : prior,
			});
			if (replacementTag && replacementTag !== tag)
				settingWrites.push({
					url: host.target.hostUrl as string,
					machineId: host.target.machineId,
					tag,
					setting: null,
					rollback: prior,
				});
		}
	const setOrder = (
		identity: string,
		kind: "project" | "collection",
		tabOrder: number,
	) => {
		const key =
			kind === "collection" ? projectCollectionId(identity) : identity;
		placements.set(key, {
			key,
			kind,
			tabOrder,
			isCollapsed: placements.get(key)?.isCollapsed ?? false,
		});
	};
	if (command.type === "create" && tag)
		setOrder(
			tag,
			"collection",
			Math.max(0, ...view.rootItems.map((row) => row.tabOrder)) + 1,
		);
	if (replacementTag && tag && replacementTag !== tag) {
		const old = placements.get(projectCollectionId(tag));
		placements.delete(projectCollectionId(tag));
		placements.set(projectCollectionId(replacementTag), {
			key: projectCollectionId(replacementTag),
			kind: "collection",
			tabOrder: old?.tabOrder ?? collection?.tabOrder ?? 0,
			isCollapsed: old?.isCollapsed ?? false,
		});
	}
	if (command.type === "collapse" && tag)
		placements.set(projectCollectionId(tag), {
			key: projectCollectionId(tag),
			kind: "collection",
			tabOrder: collection?.tabOrder ?? 0,
			isCollapsed: command.isCollapsed,
		});
	if (command.type === "reorder") {
		const requested = new Set(command.keys);
		const collection = view.collections.find((row) =>
			command.keys.every((key) =>
				row.projects.some((project) => project.id === key),
			),
		);
		const allKeys = collection
			? collection.projects.map((project) => project.id)
			: view.rootItems.map((row) =>
					row.type === "project" ? row.project.id : row.collection.id,
				);
		let index = 0;
		const keys = allKeys.map((key) =>
			requested.has(key) ? (command.keys[index++] ?? key) : key,
		);
		if (!command.keys.every((key) => allKeys.includes(key))) {
			keys.splice(0, keys.length, ...command.keys);
		}
		keys.forEach((key, index) => {
			const folder = view.collections.find((row) => row.id === key);
			if (folder) setOrder(folder.tag, "collection", index);
			else if (projectMap.has(key)) setOrder(key, "project", index);
		});
	}
	if (command.type === "move" || command.type === "create") {
		const members = tag
			? (collection?.projects.map((project) => project.id) ?? [])
			: view.rootItems
					.filter((row) => row.type === "project")
					.map((row) => row.project.id);
		const keys = tag
			? members
			: view.rootItems.map((row) =>
					row.type === "project" ? row.project.id : row.collection.id,
				);
		const ordered = keys.filter((key) => !projectIds.includes(key));
		const anchorIndex =
			command.type === "move" && command.beforeKey
				? ordered.indexOf(command.beforeKey)
				: -1;
		ordered.splice(
			command.type === "move" && command.beforeKey === null
				? ordered.length
				: anchorIndex >= 0
					? anchorIndex
					: command.type === "move"
						? (command.index ?? ordered.length)
						: ordered.length,
			0,
			...projectIds,
		);
		ordered.forEach((key, index) => {
			const folder = view.collections.find((row) => row.id === key);
			setOrder(folder?.tag ?? key, folder ? "collection" : "project", index);
		});
	}
	if (command.type === "delete" && tag) {
		const keys = view.rootItems.flatMap((row) =>
			row.type === "collection" && row.collection.tag === tag
				? row.collection.projects.map((project) => project.id)
				: [row.type === "project" ? row.project.id : row.collection.id],
		);
		keys.forEach((key, index) => {
			const folder = view.collections.find((row) => row.id === key);
			setOrder(folder?.tag ?? key, folder ? "collection" : "project", index);
		});
		placements.delete(projectCollectionId(tag));
	}
	next.placements = [...placements.values()];
	adapter.publish(next);
	const undo: Array<() => Promise<unknown>> = [];
	try {
		const settled = await Promise.allSettled(
			tagWrites.map(async (write) => {
				await adapter.setTags(write.url, write.updates);
				undo.push(() => adapter.setTags(write.url, write.rollback));
			}),
		);
		const tagFailure = settled.find((result) => result.status === "rejected");
		if (tagFailure?.status === "rejected") throw tagFailure.reason;
		const settings = await Promise.allSettled(
			settingWrites.map(async (write) => {
				try {
					await adapter.setSetting(
						write.url,
						write.tag,
						write.setting,
						write.setting ? undefined : updatedAt,
					);
				} catch (error) {
					if (!isUnsupportedProjectScope(error)) throw error;
					clearPendingSettings.push({
						machineId: write.machineId,
						tag: write.tag,
					});
					const host = next.folderHosts.find(
						(host) => host.target.hostUrl === write.url,
					);
					const prior = before.folderHosts.find(
						(host) => host.target.hostUrl === write.url,
					);
					if (host && prior) host.settings = structuredClone(prior.settings);
					return false;
				}
				clearPendingSettings.push({
					machineId: write.machineId,
					tag: write.tag,
				});
				undo.push(() =>
					adapter.setSetting(
						write.url,
						write.tag,
						write.rollback
							? {
									...write.rollback,
									updatedAt: Math.max(Date.now(), updatedAt + 1),
								}
							: null,
						write.rollback ? undefined : Math.max(Date.now(), updatedAt + 1),
					),
				);
				return true;
			}),
		);
		const settingFailure = settings.find(
			(result) => result.status === "rejected",
		);
		if (settingFailure?.status === "rejected") throw settingFailure.reason;
		if (
			settingWrites.length &&
			!settings.some(
				(result) => result.status === "fulfilled" && result.value === true,
			)
		) {
			await Promise.allSettled(undo.reverse().map((rollback) => rollback()));
			adapter.publish(before);
			return false;
		}
		adapter.publish(next);
		await adapter.writePlacements(
			next.placements,
			before.placements
				.filter((row) => !placements.has(row.key))
				.map((row) => row.key),
			pendingDeletes,
			command.type === "create" && tag ? [tag] : [],
			pendingPresentations,
			clearPendingSettings,
		);
		return true;
	} catch (error) {
		await Promise.allSettled(undo.reverse().map((rollback) => rollback()));
		adapter.publish(before);
		if (isMissingProcedureError(error)) {
			for (const host of before.projectHosts)
				for (const row of host.rows ?? [])
					if (projectIds.includes(row.id)) row.supportsProjectTags = false;
			adapter.publish(before);
			return false;
		}
		throw error;
	} finally {
		if (tagWrites.length || settingWrite) await adapter.invalidate();
	}
}
