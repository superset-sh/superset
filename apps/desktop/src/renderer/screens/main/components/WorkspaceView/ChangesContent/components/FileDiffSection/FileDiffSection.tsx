import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import { Collapsible, CollapsibleContent } from "@superset/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiMiniMinus, HiMiniPlus } from "react-icons/hi2";
import {
	LuCheck,
	LuCopy,
	LuExternalLink,
	LuLoader,
	LuUndo2,
} from "react-icons/lu";
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
import { createFileKey, useScrollContext } from "../../context";
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
	const {
		registerFileRef,
		viewedFiles,
		setFileViewed,
		setActiveFileKey,
	} = useScrollContext();
	const { viewMode: diffViewMode, hideUnchangedRegions } = useChangesStore();
	const [isCopied, setIsCopied] = useState(false);

	const fileKey = createFileKey(file, category, commitHash);
	const isViewed = viewedFiles.has(fileKey);

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

	const handleCopyPath = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			navigator.clipboard.writeText(file.path);
			setIsCopied(true);
			setTimeout(() => setIsCopied(false), 2000);
		},
		[file.path],
	);

	useEffect(() => {
		registerFileRef(file, category, commitHash, sectionRef.current);
		return () => {
			registerFileRef(file, category, commitHash, null);
		};
	}, [file, category, commitHash, registerFileRef]);

	// IntersectionObserver to track active file on scroll
	useEffect(() => {
		const element = sectionRef.current;
		if (!element) return;

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting && entry.intersectionRatio > 0.1) {
						setActiveFileKey(fileKey);
					}
				}
			},
			{
				root: null,
				rootMargin: "-100px 0px -60% 0px", // Trigger when file header is near top
				threshold: [0.1],
			},
		);

		observer.observe(element);

		return () => {
			observer.disconnect();
		};
	}, [fileKey, setActiveFileKey]);

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

	const statusBadgeColor = getStatusColor(file.status);
	const statusIndicator = getStatusIndicator(file.status);
	const showStats = file.additions > 0 || file.deletions > 0;
	const hasAction = onStage || onUnstage;
	const isDeleteAction = file.status === "untracked" || file.status === "added";

	return (
		<div ref={sectionRef} className="border-b border-border">
			<Collapsible open={isExpanded} onOpenChange={onToggleExpanded}>
				<div
					className={cn(
						"group flex items-center gap-2 px-3 py-1.5 w-full text-left sticky top-0 z-10 border-b border-border",
					)}
				>
					<span className={cn("shrink-0 flex items-center", statusBadgeColor)}>
						{statusIndicator}
					</span>

					<Tooltip>
						<TooltipTrigger asChild>
							{/* biome-ignore lint/a11y/useKeyWithClickEvents: nested interactive element */}
							{/* biome-ignore lint/a11y/noStaticElementInteractions: clickable to open in editor */}
							<span
								className="group/filename flex items-center gap-1 text-xs truncate min-w-0 flex-1 hover:underline hover:text-primary cursor-pointer font-mono"
								onClick={handleOpenInEditor}
							>
								<span className="truncate">{file.path}</span>
								<LuExternalLink className="size-3 shrink-0 opacity-0 group-hover/filename:opacity-100 transition-opacity" />
							</span>
						</TooltipTrigger>
						<TooltipContent side="bottom" showArrow={false}>
							Click to open in editor
						</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={handleCopyPath}
								className="shrink-0 rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground hover:bg-accent"
							>
								{isCopied ? (
									<LuCheck className="size-3.5 text-green-500" />
								) : (
									<LuCopy className="size-3.5" />
								)}
							</button>
						</TooltipTrigger>
						<TooltipContent side="bottom" showArrow={false}>
							{isCopied ? "Copied!" : "Copy path"}
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

					{/* biome-ignore lint/a11y/useKeyWithClickEvents: checkbox handles keyboard events */}
					{/* biome-ignore lint/a11y/noStaticElementInteractions: wrapper for checkbox */}
					<div
						className="flex items-center gap-1.5 shrink-0 text-xs cursor-pointer select-none"
						onClick={(e) => e.stopPropagation()}
					>
						<Checkbox
							id={`viewed-${fileKey}`}
							checked={isViewed}
							onCheckedChange={(checked) => setFileViewed(fileKey, checked === true)}
							className="size-3.5"
						/>
						<label
							htmlFor={`viewed-${fileKey}`}
							className="text-muted-foreground cursor-pointer"
						>
							Viewed
						</label>
					</div>

					{/* biome-ignore lint/a11y/useKeyWithClickEvents: nested interactive elements handle their own events */}
					{/* biome-ignore lint/a11y/noStaticElementInteractions: this span just stops click propagation */}
					<span
						className="flex items-center gap-1 shrink-0"
						onClick={(e) => e.stopPropagation()}
					>
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
				</div>

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
