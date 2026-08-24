import {
	type CodeViewItem,
	type DiffLineAnnotation,
	type FileDiffMetadata,
	type LineAnnotation,
	parseDiffFromFile,
} from "@pierre/diffs";
import type { AppRouter } from "@superset/host-service";
import { useWorkspaceClient, workspaceTrpc } from "@superset/workspace-client";
import { useQueries } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { useMemo, useRef } from "react";
import {
	type ChangesetFile,
	getChangesetFileKey,
} from "../../../../../useChangeset";
import type { DiffAnnotationMetadata } from "../useDiffAnnotations";

type GetDiffInput = inferRouterInputs<AppRouter>["git"]["getDiff"];
type GetDiffBulkInput = inferRouterInputs<AppRouter>["git"]["getDiffBulk"];
type GetDiffBulkOutput = inferRouterOutputs<AppRouter>["git"]["getDiffBulk"];
type DiffContent = Omit<GetDiffBulkOutput["diffs"][number], "path">;

interface UseDiffCodeViewItemsOptions {
	workspaceId: string;
	files: ChangesetFile[];
	collapsedSet: ReadonlySet<string>;
	editingSet: ReadonlySet<string>;
	editorRevisionByItemId: ReadonlyMap<string, number>;
	annotationsByPath: ReadonlyMap<
		string,
		DiffLineAnnotation<DiffAnnotationMetadata>[]
	>;
	/** Extra in-memory annotations keyed by CodeView item id (e.g. the live
	 *  agent-comment composer). Merged on top of `annotationsByPath`. */
	extraAnnotationsByItemId?: ReadonlyMap<
		string,
		DiffLineAnnotation<DiffAnnotationMetadata>[]
	> | null;
}

interface UseDiffCodeViewItemsResult {
	items: CodeViewItem<DiffAnnotationMetadata>[];
	fileByItemId: Map<string, ChangesetFile>;
	hasPendingDiff: boolean;
	hasDiffError: boolean;
}

/** A file's diff request, grouped with every other file that shares the same
 * (category, baseBranch, commitHash, fromHash) — i.e. the same `getDiffBulk`
 * call. A DiffPane's file list can mix categories (e.g. staged + unstaged +
 * against-base all in one "changes" view), so this is usually 1-3 groups,
 * never one per file. */
interface DiffGroup {
	key: string;
	bulkInput: Omit<GetDiffBulkInput, "workspaceId" | "paths">;
	members: { file: ChangesetFile; itemId: string; path: string }[];
}

function groupKeyFor(input: GetDiffInput): string {
	return [
		input.category,
		input.baseBranch ?? "",
		input.commitHash ?? "",
		input.fromHash ?? "",
	].join("\0");
}

export function useDiffCodeViewItems({
	workspaceId,
	files,
	collapsedSet,
	editingSet,
	editorRevisionByItemId,
	annotationsByPath,
	extraAnnotationsByItemId,
}: UseDiffCodeViewItemsOptions): UseDiffCodeViewItemsResult {
	const { trpcClient } = useWorkspaceClient();

	const diffRequests = useMemo(
		() =>
			files
				.filter((file) => !file.isBinary)
				.map((file) => ({
					file,
					input: createGetDiffInput(workspaceId, file),
				})),
		[files, workspaceId],
	);

	const diffGroups = useMemo<DiffGroup[]>(() => {
		const groups = new Map<string, DiffGroup>();
		for (const { file, input } of diffRequests) {
			const key = groupKeyFor(input);
			let group = groups.get(key);
			if (!group) {
				group = {
					key,
					bulkInput: {
						category: input.category,
						baseBranch: input.baseBranch,
						commitHash: input.commitHash,
						fromHash: input.fromHash,
					},
					members: [],
				};
				groups.set(key, group);
			}
			group.members.push({
				file,
				itemId: getDiffItemId(file),
				path: input.path,
			});
		}
		return [...groups.values()];
	}, [diffRequests]);

	const diffGroupQueries = useQueries({
		queries: diffGroups.map((group) => {
			const input: GetDiffBulkInput = {
				workspaceId,
				paths: group.members.map((member) => member.path),
				...group.bulkInput,
			};
			return {
				queryKey: getQueryKey(workspaceTrpc.git.getDiffBulk, input, "query"),
				queryFn: () => trpcClient.git.getDiffBulk.query(input),
				staleTime: Number.POSITIVE_INFINITY,
			};
		}),
	});

	// The query key includes each group's full `paths` array, so an ordinary
	// worktree change (a file added/removed) rotates the key and drops
	// `query.data` to undefined until the refetch lands. `useQueries` matches
	// observers to `diffGroups` by array *position*, not by `group.key` — and
	// a category going from zero files to some (or vice versa) inserts/removes
	// a whole group, shifting every later group's index. `placeholderData:
	// keepPreviousData` would then hand back the wrong group's stale data at
	// that shifted position. Cache the last successful response per
	// `group.key` instead, so a rotated/shifted query still finds the right
	// group's prior content — its items stay visible while it refetches.
	const groupDataCacheRef = useRef(new Map<string, GetDiffBulkOutput>());

	// One lookup per group resolution (not per file, not per render) — keeps
	// the per-file work below linear in file count instead of the quadratic
	// rebuild the old per-file `useQueries` produced. `revision` is a hash of
	// this file's own contents, not the group's fetch timestamp — a group
	// query covers every file sharing a category, so keying off
	// `dataUpdatedAt` would invalidate every other file's parsed-diff and
	// highlight caches whenever any one file in the group changed.
	const diffContentByItemId = useMemo(() => {
		const map = new Map<string, DiffContent & { revision: number }>();
		const cache = groupDataCacheRef.current;
		const liveGroupKeys = new Set<string>();
		diffGroups.forEach((group, index) => {
			liveGroupKeys.add(group.key);
			const query = diffGroupQueries[index];
			if (query?.data) cache.set(group.key, query.data);
			const data = query?.data ?? cache.get(group.key);
			if (!data) return;
			const byPath = new Map(data.diffs.map((d) => [d.path, d]));
			for (const member of group.members) {
				const entry = byPath.get(member.path);
				if (!entry) continue;
				map.set(member.itemId, {
					oldFile: entry.oldFile,
					newFile: entry.newFile,
					revision: hashString(
						`${entry.oldFile.contents}\0${entry.newFile.contents}`,
					),
				});
			}
		});
		// Drop cached groups that no longer exist so this doesn't grow
		// unbounded as the user changes base branch or navigates diffs.
		for (const key of cache.keys()) {
			if (!liveGroupKeys.has(key)) cache.delete(key);
		}
		return map;
	}, [diffGroups, diffGroupQueries]);

	const fileByItemId = useMemo(() => {
		const map = new Map<string, ChangesetFile>();
		for (const file of files) {
			map.set(getDiffItemId(file), file);
		}
		return map;
	}, [files]);

	// Parsing a file's diff (parseDiffFromFile) is the expensive part of
	// building an item — cache it per item id, keyed by the file's content
	// revision, so a render triggered by something unrelated (collapsed
	// state, an annotation on a different file, another file in the same
	// group refetching) doesn't re-parse every file.
	const fileDiffCacheRef = useRef(
		new Map<string, { revision: number; fileDiff: FileDiffMetadata }>(),
	);

	const items = useMemo<CodeViewItem<DiffAnnotationMetadata>[]>(() => {
		const nextItems: CodeViewItem<DiffAnnotationMetadata>[] = [];
		const cache = fileDiffCacheRef.current;
		const liveItemIds = new Set<string>();

		for (const file of files) {
			const itemId = getDiffItemId(file);
			liveItemIds.add(itemId);
			const collapsed = collapsedSet.has(getChangesetFileKey(file));
			const editing = editingSet.has(getChangesetFileKey(file));

			if (file.isBinary) {
				// The placeholder item only has a single line, so re-anchor any
				// existing review threads onto line 1 — otherwise they'd point at
				// diff lines that don't exist here and silently disappear.
				const threadAnnotations = (
					getAnnotationsForFile(annotationsByPath, file) ?? []
				).map((annotation): LineAnnotation<DiffAnnotationMetadata> => {
					const metadata = annotation.metadata;
					if (metadata.kind === "thread") {
						return {
							lineNumber: 1,
							metadata: {
								...metadata,
								sourceLine: annotation.lineNumber,
							},
						};
					}
					if (metadata.kind === "composer") {
						return { lineNumber: 1, metadata };
					}
					return { lineNumber: 1, metadata };
				});
				const annotations: LineAnnotation<DiffAnnotationMetadata>[] = [
					{
						lineNumber: 1,
						metadata: { kind: "binary-placeholder" },
					},
					...threadAnnotations,
				];
				nextItems.push({
					id: itemId,
					type: "file",
					file: {
						name: file.path,
						contents: " ",
					},
					annotations,
					collapsed,
					version: hashString(
						[
							file.path,
							file.oldPath ?? "",
							file.status,
							file.additions,
							file.deletions,
							"binary",
							collapsed ? "1" : "0",
							getAnnotationsVersion(annotations),
						].join("\0"),
					),
				});
				continue;
			}

			const content = diffContentByItemId.get(itemId);
			if (!content) continue;

			const cached = cache.get(itemId);
			const fileDiff =
				cached && cached.revision === content.revision
					? cached.fileDiff
					: parseDiffFromFile(
							{
								...content.oldFile,
								name: file.oldPath ?? file.path,
								// Lets @pierre/diffs' WorkerPoolManager reuse an
								// already-highlighted AST across remounts (e.g.
								// navigating away from a workspace and back), which
								// this hook's own fileDiffCacheRef can't cover since
								// it's wiped on unmount. revision changes only when
								// this file's own contents change, not when a
								// sibling in the same bulk group refetches.
								cacheKey: `${itemId}:${content.revision}:old`,
							},
							{
								...content.newFile,
								name: file.path,
								cacheKey: `${itemId}:${content.revision}:new`,
							},
						);
			if (!cached || cached.revision !== content.revision) {
				cache.set(itemId, { revision: content.revision, fileDiff });
			}

			const baseAnnotations = getAnnotationsForFile(annotationsByPath, file);
			const extra = extraAnnotationsByItemId?.get(itemId);
			const annotations =
				baseAnnotations && extra
					? [...baseAnnotations, ...extra]
					: (extra ?? baseAnnotations);
			const version = hashString(
				[
					content.revision,
					file.path,
					file.oldPath ?? "",
					file.status,
					file.additions,
					file.deletions,
					collapsed ? "1" : "0",
					editing ? "editing" : "readonly",
					editorRevisionByItemId.get(itemId) ?? 0,
					getAnnotationsVersion(annotations),
				].join("\0"),
			);

			nextItems.push({
				id: itemId,
				type: "diff",
				fileDiff,
				annotations,
				collapsed,
				edit: editing,
				version,
			});
		}

		// Drop cache entries for files no longer in the changeset so the map
		// doesn't grow unbounded as the user navigates between diffs.
		for (const key of cache.keys()) {
			if (!liveItemIds.has(key)) cache.delete(key);
		}

		return nextItems;
	}, [
		files,
		diffContentByItemId,
		annotationsByPath,
		collapsedSet,
		editingSet,
		editorRevisionByItemId,
		extraAnnotationsByItemId,
	]);

	return {
		items,
		fileByItemId,
		hasPendingDiff: diffGroupQueries.some((query) => query.isPending),
		hasDiffError: diffGroupQueries.some((query) => query.isError),
	};
}

function createGetDiffInput(
	workspaceId: string,
	file: ChangesetFile,
): GetDiffInput {
	const { source } = file;
	if (source.kind === "against-base") {
		return {
			workspaceId,
			path: file.path,
			category: "against-base",
			baseBranch: source.baseBranch ?? undefined,
		};
	}
	if (source.kind === "commit") {
		return {
			workspaceId,
			path: file.path,
			category: "commit",
			commitHash: source.commitHash,
			fromHash: source.fromHash,
		};
	}
	return {
		workspaceId,
		path: file.path,
		category: source.kind,
	};
}

function getDiffItemId(file: ChangesetFile): string {
	return `diff:${getChangesetFileKey(file)}`;
}

function getAnnotationsForFile(
	annotationsByPath: ReadonlyMap<
		string,
		DiffLineAnnotation<DiffAnnotationMetadata>[]
	>,
	file: ChangesetFile,
): DiffLineAnnotation<DiffAnnotationMetadata>[] | undefined {
	const current = annotationsByPath.get(file.path);
	const previous =
		file.oldPath && file.oldPath !== file.path
			? annotationsByPath.get(file.oldPath)
			: undefined;
	if (current && previous) return [...previous, ...current];
	return current ?? previous;
}

function getAnnotationsVersion(
	annotations:
		| (
				| DiffLineAnnotation<DiffAnnotationMetadata>
				| LineAnnotation<DiffAnnotationMetadata>
		  )[]
		| undefined,
): string {
	if (!annotations?.length) return "";
	return annotations
		.map((annotation) => {
			const m = annotation.metadata;
			const side = "side" in annotation ? annotation.side : "file";
			if (m.kind === "composer") {
				return [
					"c",
					side,
					annotation.lineNumber,
					m.startLine,
					m.endLine,
					m.startSide,
					m.endSide,
				].join(",");
			}
			if (m.kind !== "thread") return "local";
			return [
				"t",
				side,
				annotation.lineNumber,
				m.threadId,
				m.isResolved ? "1" : "0",
				m.isOutdated ? "1" : "0",
				m.comments.length,
			].join(",");
		})
		.join("|");
}

function hashString(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}
