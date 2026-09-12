import {
	type CodeViewItem,
	type DiffLineAnnotation,
	type FileDiffMetadata,
	type LineAnnotation,
	parseDiffFromFile,
	parsePatchFiles,
} from "@pierre/diffs";
import type { AppRouter } from "@superset/host-service";
import { useWorkspaceClient, workspaceTrpc } from "@superset/workspace-client";
import { useQueries } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import type { inferRouterInputs } from "@trpc/server";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isMissingProcedureError } from "renderer/lib/isMissingProcedureError";
import {
	type ChangesetFile,
	getChangesetFileKey,
} from "../../../../../useChangeset";
import { createGetDiffInput } from "../../utils/createGetDiffInput";
import { isGeneratedDiffFile } from "../../utils/diffLoadingGuards";
import { hashString } from "../../utils/hashString";
import type {
	DeferredDiffReason,
	DiffAnnotationMetadata,
} from "../useDiffAnnotations";

type GetDiffPatchInput = inferRouterInputs<AppRouter>["git"]["getDiffPatch"];

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
	extraAnnotationsByItemId?: ReadonlyMap<
		string,
		DiffLineAnnotation<DiffAnnotationMetadata>[]
	> | null;
}

interface UseDiffCodeViewItemsResult {
	items: CodeViewItem<DiffAnnotationMetadata>[];
	fileByItemId: Map<string, ChangesetFile>;
	requestDiff: (itemId: string) => void;
}

/** A patch request: every file sharing a (category, baseBranch, commitHash,
 * fromHash) resolves to one `git diff`. A DiffPane's file list can mix
 * categories (staged + unstaged + against-base in one "changes" view), so
 * this is usually 1-3 groups, never one per file. */
interface PatchGroup {
	key: string;
	input: GetDiffPatchInput;
	members: { file: ChangesetFile; itemId: string }[];
}

/** What a group resolves to. `patch` is the normal path; `files` is what an
 * older host-service without `git.getDiffPatch` can still give us — the full
 * contents per file, which parse into complete (non-partial) metadata. */
type PatchGroupResult =
	| { kind: "patch"; patch: string }
	| {
			kind: "files";
			files: {
				path: string;
				oldPath?: string;
				oldFile: { name: string; contents: string };
				newFile: { name: string; contents: string };
			}[];
	  };

/** How many per-file `getDiff` calls the fallback runs at once. */
const FALLBACK_CONCURRENCY = 6;

function groupKeyFor(input: GetDiffPatchInput): string {
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
	// Generated artifacts (lockfiles, compiled catalogs) stay collapsed behind
	// a button: their patches are tens of thousands of hunk lines of noise,
	// and the compiled ones are single multi-megabyte lines, which
	// @pierre/diffs documents as its own unsolved case.
	const [requestedItemIds, setRequestedItemIds] = useState<ReadonlySet<string>>(
		new Set(),
	);
	const requestedItemIdsRef = useRef(requestedItemIds);
	requestedItemIdsRef.current = requestedItemIds;
	const retryByItemIdRef = useRef(new Map<string, () => void>());

	const fileByItemId = useMemo(() => {
		const map = new Map<string, ChangesetFile>();
		for (const file of files) {
			map.set(getDiffItemId(file), file);
		}
		return map;
	}, [files]);

	useEffect(() => {
		setRequestedItemIds((current) => {
			let changed = false;
			const next = new Set<string>();
			for (const itemId of current) {
				if (fileByItemId.has(itemId)) next.add(itemId);
				else changed = true;
			}
			return changed ? next : current;
		});
	}, [fileByItemId]);

	const requestDiff = useCallback((itemId: string) => {
		// A file already covered by a patch request has nothing to opt into —
		// the only useful action is refetching its group. Held-back generated
		// files have no group yet, so they get added to one instead.
		const retry = retryByItemIdRef.current.get(itemId);
		if (retry) {
			retry();
			return;
		}
		setRequestedItemIds((current) => {
			if (current.has(itemId)) return current;
			const next = new Set(current);
			next.add(itemId);
			return next;
		});
	}, []);

	const patchGroups = useMemo<PatchGroup[]>(() => {
		const groups = new Map<string, PatchGroup>();
		for (const file of files) {
			if (file.isBinary) continue;
			const itemId = getDiffItemId(file);
			if (isGeneratedDiffFile(file.path) && !requestedItemIds.has(itemId)) {
				continue;
			}
			const input = createGetDiffPatchInput(workspaceId, file);
			const key = groupKeyFor(input);
			let group = groups.get(key);
			if (!group) {
				group = {
					key,
					input: { ...input, paths: [], untrackedPaths: [] },
					members: [],
				};
				groups.set(key, group);
			}
			// `git diff` doesn't report untracked files; those need their own
			// --no-index section, which the host builds.
			const bucket =
				file.status === "untracked"
					? group.input.untrackedPaths
					: group.input.paths;
			bucket?.push(file.path);
			group.members.push({ file, itemId });
		}
		return [...groups.values()];
	}, [files, requestedItemIds, workspaceId]);

	const patchQueries = useQueries({
		queries: patchGroups.map((group) => ({
			queryKey: getQueryKey(
				workspaceTrpc.git.getDiffPatch,
				group.input,
				"query",
			),
			queryFn: async (): Promise<PatchGroupResult> => {
				try {
					const { patch } = await trpcClient.git.getDiffPatch.query(
						group.input,
					);
					return { kind: "patch", patch };
				} catch (error) {
					if (!isMissingProcedureError(error)) throw error;
					// Older host-service (a remote host or cloud sandbox that
					// hasn't been updated): fetch each file's contents the way
					// the pane used to, so the changeset still renders.
					const members = [...group.members];
					const files: Extract<PatchGroupResult, { kind: "files" }>["files"] =
						[];
					const workers = Array.from(
						{ length: Math.min(FALLBACK_CONCURRENCY, members.length) },
						async () => {
							for (;;) {
								const member = members.shift();
								if (!member) return;
								const { oldFile, newFile } = await trpcClient.git.getDiff.query(
									createGetDiffInput(workspaceId, member.file),
								);
								files.push({
									path: member.file.path,
									oldPath: member.file.oldPath,
									oldFile,
									newFile,
								});
							}
						},
					);
					await Promise.all(workers);
					return { kind: "files", files };
				}
			},
			staleTime: Number.POSITIVE_INFINITY,
		})),
	});

	// @pierre/diffs hydrates a partial diff by upgrading the metadata object in
	// place, so the same object has to survive re-renders or every expansion
	// is thrown away. Cache per group, keyed by when the patch last resolved.
	const parsedPatchCacheRef = useRef(
		new Map<
			string,
			{ updatedAt: number; byPath: Map<string, FileDiffMetadata> }
		>(),
	);
	retryByItemIdRef.current = new Map(
		patchGroups.flatMap((group, index) =>
			group.members.map(
				(member) =>
					[member.itemId, () => void patchQueries[index]?.refetch()] as const,
			),
		),
	);

	const diffByItemId = useMemo(() => {
		const map = new Map<string, FileDiffMetadata>();
		const cache = parsedPatchCacheRef.current;
		const liveGroupKeys = new Set<string>();
		patchGroups.forEach((group, index) => {
			liveGroupKeys.add(group.key);
			const query = patchQueries[index];
			const data = query?.data;
			const updatedAt = query?.dataUpdatedAt ?? 0;
			let parsed = cache.get(group.key);
			if (data && parsed?.updatedAt !== updatedAt) {
				const byPath = new Map<string, FileDiffMetadata>();
				if (data.kind === "patch") {
					for (const section of parsePatchFiles(
						data.patch,
						`${group.key}:${updatedAt}`,
					)) {
						for (const fileDiff of section.files) {
							byPath.set(fileDiff.name, fileDiff);
							if (fileDiff.prevName) byPath.set(fileDiff.prevName, fileDiff);
						}
					}
				} else {
					for (const file of data.files) {
						byPath.set(
							file.path,
							parseDiffFromFile(
								{
									...file.oldFile,
									name: file.oldPath ?? file.path,
									cacheKey: `${group.key}:${updatedAt}:${file.path}:old`,
								},
								{
									...file.newFile,
									name: file.path,
									cacheKey: `${group.key}:${updatedAt}:${file.path}:new`,
								},
							),
						);
					}
				}
				parsed = { updatedAt, byPath };
				cache.set(group.key, parsed);
			}
			if (!parsed) return;
			for (const member of group.members) {
				const fileDiff =
					parsed.byPath.get(member.file.path) ??
					(member.file.oldPath
						? parsed.byPath.get(member.file.oldPath)
						: undefined);
				if (fileDiff) map.set(member.itemId, fileDiff);
			}
		});
		for (const key of cache.keys()) {
			if (!liveGroupKeys.has(key)) cache.delete(key);
		}
		return map;
	}, [patchGroups, patchQueries]);

	const reasonByItemId = useMemo(() => {
		const map = new Map<string, DeferredDiffReason>();
		patchGroups.forEach((group, index) => {
			const query = patchQueries[index];
			const reason: DeferredDiffReason = query?.isError
				? "error"
				: query?.data
					? "deferred"
					: "loading";
			for (const member of group.members) map.set(member.itemId, reason);
		});
		return map;
	}, [patchGroups, patchQueries]);

	const items = useMemo<CodeViewItem<DiffAnnotationMetadata>[]>(() => {
		const nextItems: CodeViewItem<DiffAnnotationMetadata>[] = [];

		for (const file of files) {
			const itemId = getDiffItemId(file);
			const collapsed = collapsedSet.has(getChangesetFileKey(file));
			const editing = editingSet.has(getChangesetFileKey(file));

			if (file.isBinary) {
				nextItems.push(
					buildPlaceholderItem(annotationsByPath, file, itemId, collapsed, {
						kind: "binary-placeholder",
					}),
				);
				continue;
			}

			const fileDiff = diffByItemId.get(itemId);
			if (!fileDiff) {
				const heldBack =
					isGeneratedDiffFile(file.path) && !requestedItemIds.has(itemId);
				const groupReason = reasonByItemId.get(itemId) ?? "loading";
				// The group resolved but carries no section for this path (an
				// empty patch, or a change git expresses without hunks such as
				// a mode-only edit). That is a failure to show the diff, not a
				// file we chose to hold back — offer Retry, not "Load diff".
				const reason: DeferredDiffReason = heldBack
					? "deferred"
					: groupReason === "deferred"
						? "error"
						: groupReason;
				nextItems.push(
					buildPlaceholderItem(annotationsByPath, file, itemId, collapsed, {
						kind: "deferred-placeholder",
						reason,
					}),
				);
				continue;
			}

			const baseAnnotations = getAnnotationsForFile(annotationsByPath, file);
			const extra = extraAnnotationsByItemId?.get(itemId);
			const annotations =
				baseAnnotations && extra
					? [...baseAnnotations, ...extra]
					: (extra ?? baseAnnotations);
			const version = hashString(
				[
					fileDiff.cacheKey ?? "",
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

		return nextItems;
	}, [
		files,
		diffByItemId,
		reasonByItemId,
		requestedItemIds,
		annotationsByPath,
		collapsedSet,
		editingSet,
		editorRevisionByItemId,
		extraAnnotationsByItemId,
	]);

	return {
		items,
		fileByItemId,
		requestDiff,
	};
}

/** A file rendered as a single-line placeholder: binary, generated, or a
 * patch that hasn't arrived. */
function buildPlaceholderItem(
	annotationsByPath: ReadonlyMap<
		string,
		DiffLineAnnotation<DiffAnnotationMetadata>[]
	>,
	file: ChangesetFile,
	itemId: string,
	collapsed: boolean,
	placeholder: DiffAnnotationMetadata,
): CodeViewItem<DiffAnnotationMetadata> {
	const annotations = getPlaceholderAnnotations(
		annotationsByPath,
		file,
		placeholder,
	);
	return {
		id: itemId,
		type: "file",
		file: { name: file.path, contents: " " },
		annotations,
		collapsed,
		version: hashString(
			[
				file.path,
				file.oldPath ?? "",
				file.status,
				file.additions,
				file.deletions,
				placeholder.kind === "deferred-placeholder"
					? placeholder.reason
					: placeholder.kind,
				collapsed ? "1" : "0",
				getAnnotationsVersion(annotations),
			].join("\0"),
		),
	};
}

function createGetDiffPatchInput(
	workspaceId: string,
	file: ChangesetFile,
): GetDiffPatchInput {
	const { source } = file;
	if (source.kind === "against-base") {
		return {
			workspaceId,
			category: "against-base",
			baseBranch: source.baseBranch ?? undefined,
		};
	}
	if (source.kind === "commit") {
		return {
			workspaceId,
			category: "commit",
			commitHash: source.commitHash,
			fromHash: source.fromHash,
		};
	}
	return { workspaceId, category: source.kind };
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

/** `LineAnnotation<M>` distributes over `M`, so an annotation whose metadata is
 * still the whole union isn't assignable to it. Everything here lands on line 1
 * regardless of which member it holds, so the pairing can't go wrong — keep the
 * assertion in one place rather than at every construction site. */
function toLineOneAnnotation(
	metadata: DiffAnnotationMetadata,
): LineAnnotation<DiffAnnotationMetadata> {
	return { lineNumber: 1, metadata } as LineAnnotation<DiffAnnotationMetadata>;
}

/** Annotations for a file rendered as a single-line placeholder (binary, or a
 * diff we haven't loaded). Existing review threads are re-anchored onto line 1
 * — otherwise they'd point at diff lines that don't exist here and silently
 * disappear — keeping their original line in `sourceLine`. */
function getPlaceholderAnnotations(
	annotationsByPath: ReadonlyMap<
		string,
		DiffLineAnnotation<DiffAnnotationMetadata>[]
	>,
	file: ChangesetFile,
	placeholder: DiffAnnotationMetadata,
): LineAnnotation<DiffAnnotationMetadata>[] {
	const threadAnnotations = (
		getAnnotationsForFile(annotationsByPath, file) ?? []
	).map((annotation) =>
		toLineOneAnnotation(
			annotation.metadata.kind === "thread"
				? { ...annotation.metadata, sourceLine: annotation.lineNumber }
				: annotation.metadata,
		),
	);
	return [toLineOneAnnotation(placeholder), ...threadAnnotations];
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
