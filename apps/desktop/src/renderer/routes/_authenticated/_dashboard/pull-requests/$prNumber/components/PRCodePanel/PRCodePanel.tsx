import type { CodeViewItem, FileDiffMetadata } from "@pierre/diffs";
import { parsePatchFiles } from "@pierre/diffs";
import { CodeView, type CodeViewHandle } from "@pierre/diffs/react";
import {
	FileTree as PierreFileTree,
	useFileTree as usePierreFileTree,
} from "@pierre/trees/react";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { SquareSplitHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GoGitPullRequest } from "react-icons/go";
import { LuPanelRight, LuRefreshCw } from "react-icons/lu";
import { TbScan } from "react-icons/tb";
import { useFallthroughIcons } from "renderer/lib/fileIcons";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	createPierreTreeStyle,
	PIERRE_TREE_UNSAFE_CSS,
	type PierreGitStatusEntry,
} from "renderer/lib/pierreTree";
import type { DiffAnnotationMetadata } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/DiffPane/hooks/useDiffAnnotations";
import { useDiffCodeViewTheme } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/DiffPane/hooks/useDiffCodeViewTheme";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { useSettings } from "renderer/stores/settings";

const ITEM_HEIGHT = 24;
const TREE_STYLE = createPierreTreeStyle({
	rowHeight: ITEM_HEIGHT,
	levelIndent: 8,
});

const DEFAULT_TREE_WIDTH = 288;
const MIN_TREE_WIDTH = 200;
const MAX_TREE_WIDTH = 600;

const CHANGE_TYPE_TO_PIERRE: Record<
	FileDiffMetadata["type"],
	PierreGitStatusEntry["status"]
> = {
	new: "added",
	deleted: "deleted",
	"rename-pure": "renamed",
	"rename-changed": "renamed",
	change: "modified",
};

interface PRCodePanelProps {
	hostUrl: string;
	projectId: string;
	prNumber: number;
}

/** The PR detail page's Code tab — file tree + diff viewer, both from
 *  `@pierre/trees`/`@pierre/diffs`, matching the workspace Changes pane. */
export function PRCodePanel({
	hostUrl,
	projectId,
	prNumber,
}: PRCodePanelProps) {
	const codeViewRef = useRef<CodeViewHandle<DiffAnnotationMetadata>>(null);
	const { options, style } = useDiffCodeViewTheme();
	const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);
	const [treeWidth, setTreeWidth] = useState(DEFAULT_TREE_WIDTH);
	const [isResizingTree, setIsResizingTree] = useState(false);
	const diffStyle = useSettings((s) => s.diffStyle);
	const updateSetting = useSettings((s) => s.update);

	const {
		data: patch,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: ["pull-request-diff", projectId, hostUrl, prNumber],
		queryFn: async () => {
			const client = getHostServiceClientByUrl(hostUrl);
			const result = await client.pullRequests.getDiff.query({
				projectId,
				prNumber,
			});
			return result.patch;
		},
		staleTime: 30_000,
		gcTime: 10 * 60_000,
		retry: false,
	});

	const files = useMemo(() => {
		if (!patch) return [];
		const parsed = parsePatchFiles(patch).flatMap((p) => p.files);
		// @pierre/trees throws on a duplicate tree path, which would take down
		// the whole detail page — last-one-wins on a repeated name defends
		// against any diff-parsing edge case that yields the same file twice.
		const byName = new Map(parsed.map((file) => [file.name, file]));
		return [...byName.values()];
	}, [patch]);

	const items = useMemo<CodeViewItem<DiffAnnotationMetadata>[]>(
		() =>
			files.map((file) => ({
				id: file.cacheKey ?? file.name,
				type: "diff",
				fileDiff: file,
			})),
		[files],
	);

	const treePaths = useMemo(() => files.map((file) => file.name), [files]);
	const gitStatusEntries = useMemo<PierreGitStatusEntry[]>(
		() =>
			files.map((file) => ({
				path: file.name,
				status: CHANGE_TYPE_TO_PIERRE[file.type],
			})),
		[files],
	);

	const handlersRef = useRef({
		onSelect(_path: string) {},
	});

	const { model } = usePierreFileTree({
		paths: treePaths,
		initialExpansion: "open",
		search: false,
		unsafeCSS: PIERRE_TREE_UNSAFE_CSS,
		gitStatus: gitStatusEntries,
		icons: { set: "complete", colored: true },
		itemHeight: ITEM_HEIGHT,
		overscan: 20,
		stickyFolders: true,
		onSelectionChange: (selected) => {
			const last = selected[selected.length - 1];
			if (!last || last.endsWith("/")) return;
			handlersRef.current.onSelect(last);
		},
	});

	useEffect(() => {
		model.resetPaths(treePaths);
		model.setGitStatus(gitStatusEntries);
	}, [model, treePaths, gitStatusEntries]);

	useFallthroughIcons(model);

	handlersRef.current.onSelect = (path) => {
		codeViewRef.current?.scrollTo({
			type: "item",
			id: path,
			align: "start",
			behavior: "smooth",
		});
	};

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center gap-2 p-8 text-muted-foreground">
				<LuRefreshCw className="size-4 animate-spin motion-reduce:animate-none" />
				<span className="text-sm">Loading diff…</span>
			</div>
		);
	}

	if (error instanceof Error || patch == null) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
				<span className="max-w-prose text-sm">
					{error instanceof Error ? error.message : "Couldn't load the diff."}
				</span>
				<Button variant="outline" size="sm" onClick={() => refetch()}>
					Try again
				</Button>
			</div>
		);
	}

	if (files.length === 0) {
		return (
			<div className="flex h-full items-center justify-center p-8">
				<div className="flex flex-col items-center gap-2 text-center text-muted-foreground">
					<GoGitPullRequest className="size-8" />
					<span className="max-w-prose text-sm text-wrap-pretty">
						No file changes found.
					</span>
				</div>
			</div>
		);
	}

	const diffStyleButtonClass = (active: boolean) =>
		cn(
			"flex size-5 items-center justify-center rounded transition-colors",
			active
				? "bg-secondary text-foreground"
				: "text-muted-foreground hover:text-foreground",
		);

	return (
		<div className="flex h-full min-h-0 w-full">
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<div className="flex shrink-0 items-center justify-end gap-0.5 border-b border-border px-2 py-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={() => updateSetting("diffStyle", "unified")}
								aria-label="Unified view"
								aria-pressed={diffStyle === "unified"}
								className={diffStyleButtonClass(diffStyle === "unified")}
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
								onClick={() => updateSetting("diffStyle", "split")}
								aria-label="Split view"
								aria-pressed={diffStyle === "split"}
								className={diffStyleButtonClass(diffStyle === "split")}
							>
								<SquareSplitHorizontal className="size-3.5" />
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom">Split view</TooltipContent>
					</Tooltip>
				</div>
				<div className="min-h-0 flex-1">
					<CodeView<DiffAnnotationMetadata>
						ref={codeViewRef}
						className="h-full w-full overflow-y-auto overflow-x-clip overscroll-contain [overflow-anchor:none]"
						style={style}
						items={items}
						options={options}
					/>
				</div>
			</div>
			{isTreeCollapsed ? (
				<div className="flex shrink-0 items-start border-l border-border p-1">
					<Button
						variant="ghost"
						size="icon-xs"
						onClick={() => setIsTreeCollapsed(false)}
						aria-label="Show file tree"
						title="Show file tree"
					>
						<LuPanelRight className="size-3.5" />
					</Button>
				</div>
			) : (
				<ResizablePanel
					width={treeWidth}
					onWidthChange={setTreeWidth}
					isResizing={isResizingTree}
					onResizingChange={setIsResizingTree}
					minWidth={MIN_TREE_WIDTH}
					maxWidth={MAX_TREE_WIDTH}
					handleSide="left"
					onDoubleClickHandle={() => setTreeWidth(DEFAULT_TREE_WIDTH)}
					className="flex min-h-0 flex-col overflow-hidden"
				>
					<div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1.5">
						<span className="text-xs font-medium text-muted-foreground">
							Files
						</span>
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={() => setIsTreeCollapsed(true)}
							aria-label="Collapse file tree"
							title="Collapse file tree"
						>
							<LuPanelRight className="size-3.5" />
						</Button>
					</div>
					<PierreFileTree
						model={model}
						className="min-h-0 flex-1"
						style={TREE_STYLE}
					/>
				</ResizablePanel>
			)}
		</div>
	);
}
