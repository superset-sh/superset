import type {
	CodeViewItem,
	DiffLineAnnotation,
	FileDiffMetadata,
	LineAnnotation,
} from "@pierre/diffs";
import { workspaceTrpc } from "@superset/workspace-client";
import { useQueries } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type {
	DiffPatchScope,
	GetDiffPatchInput,
} from "renderer/lib/diffPatchQuery";
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
import {
	type ParsedPatchGroup,
	type PatchGroupResult,
	parsePatchGroup,
} from "./parsePatchGroup";

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
	input: DiffPatchScope;
	members: PatchGroupMember[];
}

interface PatchGroupMember {
	file: ChangesetFile;
	itemId: string;
}

/** How many per-file `getDiff` calls the fallback runs at once. */
const FALLBACK_CONCURRENCY = 6;

/** Every mounted pane's members per (workspace, scope). Panes share one cache
 * entry per scope, so a fetch asks for the union; a fetch built from one
 * pane's list would leave another pane's members missing and the two would
 * refetch against each other without end. */
const membersByScope = new Map<string, Map<symbol, PatchGroupMember[]>>();

function scopeKeyFor(workspaceId: string, groupKey: string): string {
	return `${workspaceId}\0${groupKey}`;
}

function registerMembers(
	scopeKey: string,
	owner: symbol,
	members: PatchGroupMember[],
): () => void {
	let owners = membersByScope.get(scopeKey);
	if (!owners) {
		owners = new Map();
		membersByScope.set(scopeKey, owners);
	}
	owners.set(owner, members);
	return () => {
		owners.delete(owner);
		if (owners.size === 0) membersByScope.delete(scopeKey);
	};
}

function unionMembers(
	scopeKey: string,
	own: PatchGroupMember[],
): PatchGroupMember[] {
	const byPath = new Map<string, PatchGroupMember>();
	for (const member of own) byPath.set(member.file.path, member);
	for (const members of membersByScope.get(scopeKey)?.values() ?? []) {
		for (const member of members) {
			if (!byPath.has(member.file.path)) byPath.set(member.file.path, member);
		}
	}
	return [...byPath.values()];
}

function buildPatchInput(
	scope: DiffPatchScope,
	members: PatchGroupMember[],
): GetDiffPatchInput {
	const paths: string[] = [];
	const untrackedPaths: string[] = [];
	for (const { file } of members) {
		// `git diff` doesn't report untracked files; those need their own
		// --no-index section, which the host builds.
		(file.status === "untracked" ? untrackedPaths : paths).push(file.path);
	}
	return { ...scope, paths, untrackedPaths };
}

/** Whether the patch was fetched with this file, in the list its current
 * status puts it in. A file staged since the fetch moved lists, and the
 * host diffs the two lists against different bases. */
function isRequested(data: PatchGroupResult, file: ChangesetFile): boolean {
	if (!data.requestedPaths.includes(file.path)) return false;
	const wasUntracked = data.requestedUntrackedPaths.includes(file.path);
	return wasUntracked === (file.status === "untracked");
}

function memberSignature(members: PatchGroupMember[]): string {
	return members
		.map(
			({ file }) => `${file.status === "untracked" ? "u" : "t"}:${file.path}`,
		)
		.sort()
		.join("\0");
}

function groupKeyFor(input: DiffPatchScope): string {
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
	const { client: trpcClient } = workspaceTrpc.useUtils();
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
	const ownerRef = useRef<symbol>(undefined);
	ownerRef.current ??= Symbol("useDiffCodeViewItems");

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
				group = { key, input, members: [] };
				groups.set(key, group);
			}
			group.members.push({ file, itemId });
		}
		return [...groups.values()];
	}, [files, requestedItemIds, workspaceId]);

	// Layout effect: the queries below start fetching in their own passive
	// effect, and the union has to hold this pane's members by then.
	useLayoutEffect(() => {
		const owner = ownerRef.current as symbol;
		const unregister = patchGroups.map((group) =>
			registerMembers(
				scopeKeyFor(workspaceId, group.key),
				owner,
				group.members,
			),
		);
		return () => {
			for (const fn of unregister) fn();
		};
	}, [patchGroups, workspaceId]);

	const patchQueries = useQueries({
		queries: patchGroups.map((group) => ({
			queryKey: getQueryKey(
				workspaceTrpc.git.getDiffPatch,
				group.input,
				"query",
			),
			queryFn: async (): Promise<PatchGroupResult> => {
				const members = unionMembers(
					scopeKeyFor(workspaceId, group.key),
					group.members,
				);
				const input = buildPatchInput(group.input, members);
				const requested = {
					requestedPaths: [
						...(input.paths ?? []),
						...(input.untrackedPaths ?? []),
					],
					requestedUntrackedPaths: input.untrackedPaths ?? [],
				};
				try {
					const { patch } = await trpcClient.git.getDiffPatch.query(input);
					return { kind: "patch", patch, ...requested };
				} catch (error) {
					if (!isMissingProcedureError(error)) throw error;
					// Older host-service (a remote host or cloud sandbox that
					// hasn't been updated): fetch each file's contents the way
					// the pane used to, so the changeset still renders.
					const files: Extract<PatchGroupResult, { kind: "files" }>["files"] =
						[];
					const queue = [...members];
					const workers = Array.from(
						{ length: Math.min(FALLBACK_CONCURRENCY, queue.length) },
						async () => {
							for (;;) {
								const member = queue.shift();
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
					return { kind: "files", files, ...requested };
				}
			},
			staleTime: Number.POSITIVE_INFINITY,
		})),
	});

	retryByItemIdRef.current = new Map(
		patchGroups.flatMap((group, index) =>
			group.members.map(
				(member) =>
					[member.itemId, () => void patchQueries[index]?.refetch()] as const,
			),
		),
	);

	// A member the cached patch was never asked for has no section until the
	// group is fetched again. One attempt per (member set, patch): a host that
	// answers without a section for a path must not be asked forever.
	const refetchAttemptsRef = useRef(
		new Map<string, { signature: string; data: PatchGroupResult }>(),
	);
	useEffect(() => {
		patchGroups.forEach((group, index) => {
			const query = patchQueries[index];
			if (!query?.data || query.isFetching || query.isError) return;
			const { data } = query;
			if (group.members.every((member) => isRequested(data, member.file))) {
				return;
			}
			const signature = memberSignature(group.members);
			const attempt = refetchAttemptsRef.current.get(group.key);
			if (attempt?.signature === signature && attempt.data === query.data) {
				return;
			}
			refetchAttemptsRef.current.set(group.key, {
				signature,
				data: query.data,
			});
			void query.refetch();
		});
	}, [patchGroups, patchQueries]);

	// Parsed in an effect, per section, reusing unchanged sections' objects:
	// @pierre/diffs hydrates a partial diff in place, so a new object per
	// refetch would drop every expansion.
	const [parsedGroups, setParsedGroups] = useState<
		ReadonlyMap<string, ParsedPatchGroup>
	>(() => new Map());
	const parsedGroupsRef = useRef(parsedGroups);
	parsedGroupsRef.current = parsedGroups;
	useEffect(() => {
		const current = parsedGroupsRef.current;
		const next = new Map<string, ParsedPatchGroup>();
		let changed = false;
		patchGroups.forEach((group, index) => {
			const data = patchQueries[index]?.data;
			const previous = current.get(group.key);
			if (!data) {
				if (previous) next.set(group.key, previous);
				return;
			}
			if (previous?.source === data) {
				next.set(group.key, previous);
				return;
			}
			next.set(group.key, parsePatchGroup(group.key, data, previous));
			changed = true;
		});
		if (!changed && next.size === current.size) return;
		parsedGroupsRef.current = next;
		setParsedGroups(next);
	}, [patchGroups, patchQueries]);

	const diffByItemId = useMemo(() => {
		const map = new Map<string, FileDiffMetadata>();
		for (const group of patchGroups) {
			const parsed = parsedGroups.get(group.key);
			if (!parsed) continue;
			for (const member of group.members) {
				const fileDiff =
					parsed.byPath.get(member.file.path) ??
					(member.file.oldPath
						? parsed.byPath.get(member.file.oldPath)
						: undefined);
				if (fileDiff) map.set(member.itemId, fileDiff);
			}
		}
		return map;
	}, [patchGroups, parsedGroups]);

	const reasonByItemId = useMemo(() => {
		const map = new Map<string, DeferredDiffReason>();
		patchGroups.forEach((group, index) => {
			const query = patchQueries[index];
			const data = query?.data;
			// Resolved for a member only once its patch is parsed and was
			// requested with that member; in between it is still loading.
			const settled =
				data != null &&
				!query.isFetching &&
				parsedGroups.get(group.key)?.source === data;
			for (const member of group.members) {
				const reason: DeferredDiffReason = query?.isError
					? "error"
					: settled && isRequested(data, member.file)
						? "deferred"
						: "loading";
				map.set(member.itemId, reason);
			}
		});
		return map;
	}, [patchGroups, patchQueries, parsedGroups]);

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
): DiffPatchScope {
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
