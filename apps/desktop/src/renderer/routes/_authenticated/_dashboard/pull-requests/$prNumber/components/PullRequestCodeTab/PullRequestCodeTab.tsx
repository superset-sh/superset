import type {
	CodeViewItem,
	CodeViewOptions,
	DiffLineAnnotation,
} from "@pierre/diffs";
import { parsePatchFiles } from "@pierre/diffs";
import { CodeView, type CodeViewHandle } from "@pierre/diffs/react";
import { FileTree as PierreFileTree, useFileTree } from "@pierre/trees/react";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SquareSplitHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	LuPanelRight,
	LuPanelRightClose,
	LuPanelRightOpen,
} from "react-icons/lu";
import { TbScan } from "react-icons/tb";
import { CommentThread } from "renderer/components/CommentThread";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	createPierreTreeStyle,
	PIERRE_TREE_UNSAFE_CSS,
	type PierreGitStatus,
} from "renderer/lib/pierreTree";
import { WorkItemDetailState } from "renderer/routes/_authenticated/_dashboard/components/WorkItemDetailState";
import { useDiffCodeViewTheme } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/DiffPane/hooks/useDiffCodeViewTheme";

interface PullRequestCodeTabProps {
	projectId: string;
	prNumber: number;
	prUrl: string;
	hostUrl: string;
}

interface PrCommentThreadComment {
	id: string;
	authorLogin: string;
	avatarUrl?: string;
	body: string;
	createdAt?: number;
}

interface PrCommentThreadMetadata {
	threadId: string;
	comments: PrCommentThreadComment[];
	isResolved: boolean;
	isOutdated: boolean;
	url?: string;
}

type DiffStyle = "split" | "unified";

const ITEM_HEIGHT = 24;
const TREE_STYLE = createPierreTreeStyle({
	rowHeight: ITEM_HEIGHT,
	levelIndent: 8,
});

const CHANGE_TYPE_TO_PIERRE_STATUS: Record<string, PierreGitStatus> = {
	change: "modified",
	"rename-pure": "renamed",
	"rename-changed": "renamed",
	new: "added",
	deleted: "deleted",
};

interface ParsedFileDiff {
	item: CodeViewItem<PrCommentThreadMetadata>;
	path: string;
	status: PierreGitStatus;
	additions: number;
	deletions: number;
}

function parseFileDiffs(patch: string): ParsedFileDiff[] {
	try {
		return parsePatchFiles(patch, undefined, false).flatMap((parsedPatch) =>
			parsedPatch.files.map((fileDiff, index) => {
				let additions = 0;
				let deletions = 0;
				for (const hunk of fileDiff.hunks) {
					additions += hunk.additionLines;
					deletions += hunk.deletionLines;
				}
				return {
					item: { id: `${fileDiff.name}-${index}`, type: "diff", fileDiff },
					path: fileDiff.name,
					status: CHANGE_TYPE_TO_PIERRE_STATUS[fileDiff.type] ?? "modified",
					additions,
					deletions,
				};
			}),
		);
	} catch {
		return [];
	}
}

// The shared workspace DiffPane theme keeps the diff flush to its pane
// edges; this tab's card border makes that read as cramped, so give the
// code and its sticky file header some breathing room from the card edges.
const CODE_TAB_UNSAFE_CSS = `
	[data-diff] {
		padding-inline: 20px !important;
	}
	[data-diffs-header='default'] {
		padding-inline: 20px;
	}
`;

function formatDiffStats(additions: number, deletions: number): string {
	if (additions === 0 && deletions === 0) return "";
	if (additions === 0) return `−${deletions}`;
	if (deletions === 0) return `+${additions}`;
	return `+${additions} −${deletions}`;
}

export function PullRequestCodeTab({
	projectId,
	prNumber,
	prUrl,
	hostUrl,
}: PullRequestCodeTabProps) {
	const { options, style } = useDiffCodeViewTheme();
	const codeViewRef = useRef<CodeViewHandle<PrCommentThreadMetadata>>(null);
	// Defaults to unified regardless of the user's workspace diff-viewer
	// setting, and stays local so flipping it here doesn't change that setting.
	const [diffStyle, setDiffStyle] = useState<DiffStyle>("unified");
	const codeViewOptions = useMemo(
		() =>
			({
				...options,
				diffStyle,
				unsafeCSS: `${options.unsafeCSS ?? ""}\n${CODE_TAB_UNSAFE_CSS}`,
			}) as CodeViewOptions<PrCommentThreadMetadata>,
		[options, diffStyle],
	);
	const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);
	const queryClient = useQueryClient();

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ["pull-request-diff", projectId, hostUrl, prNumber],
		queryFn: async () => {
			const client = getHostServiceClientByUrl(hostUrl);
			return client.pullRequests.getDiff.query({ projectId, prNumber });
		},
		staleTime: 30_000,
		gcTime: 10 * 60_000,
	});

	const threadsQueryKey = [
		"pull-request-threads",
		projectId,
		hostUrl,
		prNumber,
	];
	const { data: threadsData } = useQuery({
		queryKey: threadsQueryKey,
		queryFn: async () => {
			const client = getHostServiceClientByUrl(hostUrl);
			return client.pullRequests.getThreads.query({ projectId, prNumber });
		},
		staleTime: 30_000,
		gcTime: 10 * 60_000,
	});
	const setThreadResolution = useMutation({
		mutationFn: async (input: { threadId: string; resolved: boolean }) => {
			const client = getHostServiceClientByUrl(hostUrl);
			return client.pullRequests.setThreadResolution.mutate(input);
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: threadsQueryKey });
		},
		onError: (mutationError) => {
			toast.error("Couldn't update thread", {
				description: mutationError.message,
			});
		},
	});

	const annotationsByPath = useMemo(() => {
		const map = new Map<
			string,
			DiffLineAnnotation<PrCommentThreadMetadata>[]
		>();
		for (const thread of threadsData?.reviewThreads ?? []) {
			if (thread.line == null || !thread.path) continue;
			const firstCommentDbId = thread.comments[0]?.databaseId;
			const list = map.get(thread.path) ?? [];
			list.push({
				side: thread.diffSide === "LEFT" ? "deletions" : "additions",
				lineNumber: thread.line,
				metadata: {
					threadId: thread.id,
					isResolved: thread.isResolved,
					isOutdated: thread.isOutdated,
					url: firstCommentDbId
						? `${prUrl}#discussion_r${firstCommentDbId}`
						: undefined,
					comments: thread.comments.map((comment) => ({
						id: comment.id,
						authorLogin: comment.author.login,
						avatarUrl: comment.author.avatarUrl,
						body: comment.body,
						createdAt: comment.createdAt
							? new Date(comment.createdAt).getTime()
							: undefined,
					})),
				},
			});
			map.set(thread.path, list);
		}
		return map;
	}, [threadsData, prUrl]);

	const files = useMemo(() => parseFileDiffs(data?.patch ?? ""), [data?.patch]);
	const items = useMemo(
		() =>
			files.map((f) => ({
				...f.item,
				annotations: annotationsByPath.get(f.path),
			})),
		[files, annotationsByPath],
	);
	const treePaths = useMemo(() => files.map((f) => f.path), [files]);
	const fileByPath = useMemo(
		() => new Map(files.map((f) => [f.path, f])),
		[files],
	);
	const itemIdByPath = useMemo(
		() => new Map(files.map((f) => [f.path, f.item.id])),
		[files],
	);
	const gitStatus = useMemo(
		() => files.map((f) => ({ path: f.path, status: f.status })),
		[files],
	);

	// Routed through a ref so Pierre's handler closures (resolved once at
	// useFileTree time) always see the latest data.
	const handlersRef = useRef({
		onSelect(_path: string) {},
		renderRowDecoration(_ctx: { item: { kind: string; path: string } }) {
			return null as { text: string } | null;
		},
	});
	handlersRef.current.onSelect = (path) => {
		const itemId = itemIdByPath.get(path);
		if (!itemId) return;
		codeViewRef.current?.scrollTo({
			type: "item",
			id: itemId,
			align: "start",
			behavior: "smooth-auto",
		});
	};
	handlersRef.current.renderRowDecoration = (ctx) => {
		if (ctx.item.kind === "directory") return null;
		const file = fileByPath.get(ctx.item.path);
		if (!file) return null;
		const text = formatDiffStats(file.additions, file.deletions);
		return text ? { text } : null;
	};

	const { model } = useFileTree({
		paths: treePaths,
		initialExpansion: "open",
		search: false,
		unsafeCSS: PIERRE_TREE_UNSAFE_CSS,
		gitStatus,
		icons: { set: "complete", colored: true },
		itemHeight: ITEM_HEIGHT,
		overscan: 20,
		stickyFolders: true,
		onSelectionChange: (selected) => {
			const last = selected[selected.length - 1];
			if (!last || last.endsWith("/")) return;
			handlersRef.current.onSelect(last);
		},
		renderRowDecoration: (ctx) => handlersRef.current.renderRowDecoration(ctx),
	});

	useEffect(() => {
		model.resetPaths(treePaths);
	}, [model, treePaths]);

	useEffect(() => {
		model.setGitStatus(gitStatus);
	}, [model, gitStatus]);

	if (isLoading) {
		return (
			<div className="flex flex-1 items-center justify-center">
				<WorkItemDetailState message="Loading diff…" isLoading />
			</div>
		);
	}

	if (error instanceof Error) {
		return (
			<div className="flex flex-1 items-center justify-center">
				<WorkItemDetailState
					message={error.message}
					isError
					onRetry={() => void refetch()}
				/>
			</div>
		);
	}

	if (items.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
				No changes to display.
			</div>
		);
	}

	const toggleClass = (active: boolean) =>
		cn(
			"flex size-5 items-center justify-center rounded transition-colors",
			active
				? "bg-secondary text-foreground"
				: "text-muted-foreground hover:text-foreground",
		);

	return (
		<div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-3 @md:px-6">
			<div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
				<div className="flex min-h-0 flex-1 flex-col">
					<div className="flex shrink-0 items-center justify-end gap-1 border-b border-border/50 px-2 py-1.5">
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => setDiffStyle("unified")}
									aria-label="Unified view"
									aria-pressed={diffStyle === "unified"}
									className={toggleClass(diffStyle === "unified")}
								>
									<TbScan className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">Unified view</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => setDiffStyle("split")}
									aria-label="Split view"
									aria-pressed={diffStyle === "split"}
									className={toggleClass(diffStyle === "split")}
								>
									<SquareSplitHorizontal className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">Split view</TooltipContent>
						</Tooltip>
						<div className="mx-1 h-4 w-px bg-border" />
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() => setIsTreeCollapsed((prev) => !prev)}
									aria-label={
										isTreeCollapsed ? "Show file tree" : "Hide file tree"
									}
									className="group flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
								>
									<span className="group-hover:hidden">
										<LuPanelRight className="size-3.5" strokeWidth={1.5} />
									</span>
									<span className="hidden group-hover:block">
										{isTreeCollapsed ? (
											<LuPanelRightOpen
												className="size-3.5"
												strokeWidth={1.5}
											/>
										) : (
											<LuPanelRightClose
												className="size-3.5"
												strokeWidth={1.5}
											/>
										)}
									</span>
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								{isTreeCollapsed ? "Show file tree" : "Hide file tree"}
							</TooltipContent>
						</Tooltip>
					</div>
					<CodeView
						ref={codeViewRef}
						className="min-h-0 flex-1 overflow-y-auto overflow-x-clip overscroll-contain [overflow-anchor:none]"
						style={style}
						items={items}
						options={codeViewOptions}
						renderAnnotation={(annotation) => {
							const m = annotation.metadata;
							if (!m) return null;
							return (
								<CommentThread
									isResolved={m.isResolved}
									isOutdated={m.isOutdated}
									url={m.url}
									comments={m.comments}
									onResolveChange={(resolved) =>
										setThreadResolution.mutate({
											threadId: m.threadId,
											resolved,
										})
									}
									isResolvePending={
										setThreadResolution.isPending &&
										setThreadResolution.variables?.threadId === m.threadId
									}
								/>
							);
						}}
					/>
				</div>
				{!isTreeCollapsed && (
					<div className="flex h-full w-56 shrink-0 flex-col border-l border-border/50">
						<PierreFileTree
							model={model}
							style={{ ...TREE_STYLE, height: "100%" }}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
