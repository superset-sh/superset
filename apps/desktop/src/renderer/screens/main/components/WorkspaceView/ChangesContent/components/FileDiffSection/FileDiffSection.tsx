import { Button } from "@superset/ui/button";
import { Collapsible, CollapsibleContent } from "@superset/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useRef } from "react";
import { HiMiniMinus, HiMiniPlus } from "react-icons/hi2";
import {
	LuChevronDown,
	LuChevronRight,
	LuExternalLink,
	LuLoader,
	LuUndo2,
} from "react-icons/lu";
import {
	TbFold,
	TbLayoutSidebarRightFilled,
	TbListDetails,
} from "react-icons/tb";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useChangesStore } from "renderer/stores/changes";
import type {
	ChangeCategory,
	ChangedFile,
	DiffViewMode,
	FileContents,
} from "shared/changes-types";
import {
	getStatusColor,
	getStatusIndicator,
} from "../../../Sidebar/ChangesView/utils";
import { useScrollContext } from "../../context";
import { DiffViewer } from "../DiffViewer";

interface DiffViewerFitContentProps {
	contents: FileContents;
	viewMode: DiffViewMode;
	hideUnchangedRegions: boolean;
	filePath: string;
}

function DiffViewerFitContent({
	contents,
	viewMode,
	hideUnchangedRegions,
	filePath,
}: DiffViewerFitContentProps) {
	return (
		<div className="bg-background">
			<DiffViewer
				contents={contents}
				viewMode={viewMode}
				hideUnchangedRegions={hideUnchangedRegions}
				filePath={filePath}
				captureScroll={false}
				fitContent
			/>
		</div>
	);
}

interface FileDiffSectionProps {
	file: ChangedFile;
	category: ChangeCategory;
	commitHash?: string;
	worktreePath: string;
	isExpanded: boolean;
	onToggleExpanded: () => void;
	onStage?: () => void;
	onUnstage?: () => void;
	onDiscard?: () => void;
	isActioning?: boolean;
}

function getFileName(path: string): string {
	return path.split("/").pop() || path;
}

export function FileDiffSection({
	file,
	category,
	commitHash,
	worktreePath,
	isExpanded,
	onToggleExpanded,
	onStage,
	onUnstage,
	onDiscard,
	isActioning = false,
}: FileDiffSectionProps) {
	const sectionRef = useRef<HTMLDivElement>(null);
	const { registerFileRef } = useScrollContext();
	const {
		viewMode: diffViewMode,
		setViewMode: setDiffViewMode,
		hideUnchangedRegions,
		toggleHideUnchangedRegions,
	} = useChangesStore();

	const openInEditorMutation =
		electronTrpc.external.openFileInEditor.useMutation();

	const handleOpenInEditor = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			if (worktreePath) {
				const absolutePath = `${worktreePath}/${file.path}`;
				openInEditorMutation.mutate({ path: absolutePath, cwd: worktreePath });
			}
		},
		[worktreePath, file.path, openInEditorMutation],
	);

	useEffect(() => {
		registerFileRef(file, category, commitHash, sectionRef.current);
		return () => {
			registerFileRef(file, category, commitHash, null);
		};
	}, [file, category, commitHash, registerFileRef]);

	const { data: branchData } = electronTrpc.changes.getBranches.useQuery(
		{ worktreePath },
		{ enabled: !!worktreePath && category === "against-base" },
	);
	const effectiveBaseBranch = branchData?.defaultBranch ?? "main";

	const { data: diffData, isLoading: isLoadingDiff } =
		electronTrpc.changes.getFileContents.useQuery(
			{
				worktreePath,
				filePath: file.path,
				oldPath: file.oldPath,
				category,
				commitHash,
				defaultBranch:
					category === "against-base" ? effectiveBaseBranch : undefined,
			},
			{
				enabled: isExpanded && !!worktreePath,
			},
		);

	const fileName = getFileName(file.path);
	const statusBadgeColor = getStatusColor(file.status);
	const statusIndicator = getStatusIndicator(file.status);
	const showStats = file.additions > 0 || file.deletions > 0;
	const hasAction = onStage || onUnstage;
	const isDeleteAction = file.status === "untracked" || file.status === "added";

	return (
		<div ref={sectionRef} className="border-b border-border">
			<Collapsible open={isExpanded} onOpenChange={onToggleExpanded}>
				<button
					type="button"
					className={cn(
						"group flex items-center gap-2 px-3 py-2 w-full text-left cursor-pointer hover:bg-accent/50 transition-colors sticky top-0 bg-muted z-10 border-b border-border",
						isExpanded && "bg-muted",
					)}
					onClick={onToggleExpanded}
				>
					<span className="shrink-0">
						{isExpanded ? (
							<LuChevronDown className="size-4 text-muted-foreground" />
						) : (
							<LuChevronRight className="size-4 text-muted-foreground" />
						)}
					</span>

					<span className={cn("shrink-0 flex items-center", statusBadgeColor)}>
						{statusIndicator}
					</span>

					<Tooltip>
						<TooltipTrigger asChild>
							{/* biome-ignore lint/a11y/useKeyWithClickEvents: nested interactive element */}
							{/* biome-ignore lint/a11y/noStaticElementInteractions: clickable to open in editor */}
							<span
								className="group/filename flex items-center gap-1 text-sm font-medium truncate min-w-0 flex-1 hover:underline hover:text-primary cursor-pointer"
								onClick={handleOpenInEditor}
							>
								<span className="truncate">{fileName}</span>
								<LuExternalLink className="size-3 shrink-0 opacity-0 group-hover/filename:opacity-100 transition-opacity" />
							</span>
						</TooltipTrigger>
						<TooltipContent side="bottom" showArrow={false}>
							<div className="flex flex-col gap-0.5">
								<span>{file.path}</span>
								<span className="text-xs text-muted-foreground">
									Click to open in editor
								</span>
							</div>
						</TooltipContent>
					</Tooltip>

					{showStats && (
						<span className="flex items-center gap-1 text-xs font-mono shrink-0">
							{file.additions > 0 && (
								<span className="text-green-600 dark:text-green-500">
									+{file.additions}
								</span>
							)}
							{file.deletions > 0 && (
								<span className="text-red-600 dark:text-red-400">
									-{file.deletions}
								</span>
							)}
						</span>
					)}

					{/* biome-ignore lint/a11y/useKeyWithClickEvents: nested interactive elements handle their own events */}
					{/* biome-ignore lint/a11y/noStaticElementInteractions: this span just stops click propagation */}
					<span
						className="flex items-center gap-1 shrink-0"
						onClick={(e) => e.stopPropagation()}
					>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={() =>
										setDiffViewMode(
											diffViewMode === "side-by-side"
												? "inline"
												: "side-by-side",
										)
									}
									className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground hover:bg-accent"
								>
									{diffViewMode === "side-by-side" ? (
										<TbLayoutSidebarRightFilled className="size-3.5" />
									) : (
										<TbListDetails className="size-3.5" />
									)}
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" showArrow={false}>
								{diffViewMode === "side-by-side"
									? "Switch to inline diff"
									: "Switch to side by side diff"}
							</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={toggleHideUnchangedRegions}
									className={cn(
										"rounded p-1 transition-colors hover:bg-accent",
										hideUnchangedRegions
											? "text-foreground"
											: "text-muted-foreground/60 hover:text-muted-foreground",
									)}
								>
									<TbFold className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom" showArrow={false}>
								{hideUnchangedRegions
									? "Show all lines"
									: "Hide unchanged regions"}
							</TooltipContent>
						</Tooltip>

						{onDiscard && (
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
										onClick={onDiscard}
										disabled={isActioning}
									>
										<LuUndo2 className="size-3.5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom" showArrow={false}>
									{isDeleteAction ? "Delete" : "Discard changes"}
								</TooltipContent>
							</Tooltip>
						)}

						{hasAction && (
							<>
								{onStage && (
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												className="size-6 opacity-0 group-hover:opacity-100 transition-opacity"
												onClick={onStage}
												disabled={isActioning}
											>
												<HiMiniPlus className="size-4" />
											</Button>
										</TooltipTrigger>
										<TooltipContent side="bottom" showArrow={false}>
											Stage
										</TooltipContent>
									</Tooltip>
								)}
								{onUnstage && (
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												className="size-6 opacity-0 group-hover:opacity-100 transition-opacity"
												onClick={onUnstage}
												disabled={isActioning}
											>
												<HiMiniMinus className="size-4" />
											</Button>
										</TooltipTrigger>
										<TooltipContent side="bottom" showArrow={false}>
											Unstage
										</TooltipContent>
									</Tooltip>
								)}
							</>
						)}
					</span>
				</button>

				<CollapsibleContent>
					{isLoadingDiff ? (
						<div className="flex items-center justify-center h-24 text-muted-foreground bg-background">
							<LuLoader className="w-4 h-4 animate-spin mr-2" />
							<span>Loading diff...</span>
						</div>
					) : diffData ? (
						<DiffViewerFitContent
							contents={diffData}
							viewMode={diffViewMode}
							hideUnchangedRegions={hideUnchangedRegions}
							filePath={file.path}
						/>
					) : (
						<div className="flex items-center justify-center h-24 text-muted-foreground bg-background">
							Unable to load diff
						</div>
					)}
				</CollapsibleContent>
			</Collapsible>
		</div>
	);
}
