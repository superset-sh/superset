import {
	type CodeViewItem,
	type DiffLineAnnotation,
	type LineAnnotation,
	parseDiffFromFile,
} from "@pierre/diffs";
import type { AppRouter } from "@superset/host-service";
import { useWorkspaceClient, workspaceTrpc } from "@superset/workspace-client";
import { useQueries } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import type { inferRouterInputs } from "@trpc/server";
import { useMemo } from "react";
import type { ChangesetFile } from "../../../../../useChangeset";
import type { DiffAnnotationMetadata } from "../useDiffAnnotations";

type GetDiffInput = inferRouterInputs<AppRouter>["git"]["getDiff"];

interface UseDiffCodeViewItemsOptions {
	workspaceId: string;
	files: ChangesetFile[];
	collapsedSet: ReadonlySet<string>;
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
	pathToItemId: Map<string, string>;
	hasPendingDiff: boolean;
	hasDiffError: boolean;
}

export function useDiffCodeViewItems({
	workspaceId,
	files,
	collapsedSet,
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

	const diffQueries = useQueries({
		queries: diffRequests.map(({ input }) => ({
			queryKey: getQueryKey(workspaceTrpc.git.getDiff, input, "query"),
			queryFn: () => trpcClient.git.getDiff.query(input),
			staleTime: Number.POSITIVE_INFINITY,
		})),
	});

	const fileByItemId = useMemo(() => {
		const map = new Map<string, ChangesetFile>();
		for (const file of files) {
			map.set(getDiffItemId(file), file);
		}
		return map;
	}, [files]);

	const pathToItemId = useMemo(() => {
		const map = new Map<string, string>();
		for (const file of files) {
			const itemId = getDiffItemId(file);
			if (!map.has(file.path)) map.set(file.path, itemId);
			if (file.oldPath && !map.has(file.oldPath)) map.set(file.oldPath, itemId);
		}
		return map;
	}, [files]);

	const items = useMemo<CodeViewItem<DiffAnnotationMetadata>[]>(() => {
		const nextItems: CodeViewItem<DiffAnnotationMetadata>[] = [];
		const queryByItemId = new Map(
			diffRequests.map((request, index) => [
				getDiffItemId(request.file),
				diffQueries[index],
			]),
		);

		for (const file of files) {
			const itemId = getDiffItemId(file);
			const collapsed = collapsedSet.has(file.path);

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

			const query = queryByItemId.get(itemId);
			if (!query?.data) continue;

			const baseAnnotations = getAnnotationsForFile(annotationsByPath, file);
			const extra = extraAnnotationsByItemId?.get(itemId);
			const annotations =
				baseAnnotations && extra
					? [...baseAnnotations, ...extra]
					: (extra ?? baseAnnotations);
			const fileDiff = parseDiffFromFile(
				{
					...query.data.oldFile,
					name: file.oldPath ?? file.path,
				},
				{
					...query.data.newFile,
					name: file.path,
				},
			);
			const version = hashString(
				[
					query.dataUpdatedAt,
					file.path,
					file.oldPath ?? "",
					file.status,
					file.additions,
					file.deletions,
					collapsed ? "1" : "0",
					getAnnotationsVersion(annotations),
				].join("\0"),
			);

			nextItems.push({
				id: itemId,
				type: "diff",
				fileDiff,
				annotations,
				collapsed,
				version,
			});
		}

		return nextItems;
	}, [
		files,
		diffRequests,
		diffQueries,
		annotationsByPath,
		collapsedSet,
		extraAnnotationsByItemId,
	]);

	return {
		items,
		fileByItemId,
		pathToItemId,
		hasPendingDiff: diffQueries.some((query) => query.isPending),
		hasDiffError: diffQueries.some((query) => query.isError),
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
	const { source } = file;
	if (source.kind === "against-base") {
		return `diff:against-base:${source.baseBranch ?? ""}:${file.path}`;
	}
	if (source.kind === "commit") {
		return `diff:commit:${source.fromHash ?? ""}:${source.commitHash}:${file.path}`;
	}
	return `diff:${source.kind}:${file.path}`;
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
