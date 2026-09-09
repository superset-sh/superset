import { Trans, useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import {
	LuChevronDown,
	LuChevronUp,
	LuColumns2,
	LuFiles,
	LuFoldVertical,
	LuMessageSquare,
	LuRows2,
	LuUnfoldVertical,
} from "react-icons/lu";
import { useSettings } from "renderer/stores/settings";

export interface DiffViewToolbarCommentNav {
	/** Index into the ordered thread list, or null before any navigation. */
	focusedIndex: number | null;
	total: number;
	onPrev: () => void;
	onNext: () => void;
}

export interface DiffViewToolbarTreeToggle {
	fileCount: number;
	isCollapsed: boolean;
	onToggle: () => void;
}

interface DiffViewToolbarProps {
	/** File-tree pill; omitted where the file list lives outside the diff (the
	 * workspace Changes pane defers to the sidebar's Changes tab). */
	tree?: DiffViewToolbarTreeToggle | null;
	areAllFilesCollapsed: boolean;
	onToggleCollapseAll: () => void;
	/** Prev/next review-comment cluster; hidden when null or total is 0. */
	commentNav?: DiffViewToolbarCommentNav | null;
	/** Rendered after the left-hand controls — the DiffPane's section label. */
	children?: ReactNode;
}

/**
 * Toolbar row above a card-styled diff (the PR Code tab and the v2-workspace
 * DiffPane): optional file-tree toggle + collapse/expand-all on the left,
 * comment navigation + unified/split on the right. The unified/split toggles
 * read/write the persisted app setting directly — the same one every diff
 * surface renders from — so a toggle made here carries across surfaces
 * instead of silently overriding the user's saved preference with a local
 * default.
 *
 * Message ids stay under dashboard.pullRequests.codeTab.* — this markup
 * moved here verbatim from PullRequestCodeTab, and keeping the ids keeps
 * every existing translation valid.
 */
export function DiffViewToolbar({
	tree,
	areAllFilesCollapsed,
	onToggleCollapseAll,
	commentNav,
	children,
}: DiffViewToolbarProps) {
	const { t } = useLingui();
	const diffStyle = useSettings((s) => s.diffStyle);
	const updateSetting = useSettings((s) => s.update);

	const toggleClass = (active: boolean) =>
		cn(
			"flex size-5 items-center justify-center rounded transition-colors",
			active
				? "bg-secondary text-foreground"
				: "text-muted-foreground hover:text-foreground",
		);

	return (
		<div className="flex shrink-0 items-center justify-between gap-1 border-b border-border/20 px-2 py-1.5">
			<div className="flex items-center gap-1">
				{tree != null && (
					<button
						type="button"
						onClick={tree.onToggle}
						aria-pressed={!tree.isCollapsed}
						aria-label={
							tree.isCollapsed
								? t({
										message: "Show file tree",
									})
								: t({
										message: "Hide file tree",
									})
						}
						className={cn(
							"flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors",
							tree.isCollapsed
								? "text-muted-foreground hover:bg-fill-hover hover:text-foreground"
								: "bg-secondary text-foreground",
						)}
					>
						<LuFiles className="size-3.5 shrink-0" strokeWidth={1.5} />
						<span className="text-[11px] font-medium">
							<Trans>Files</Trans>
						</span>
						<span
							className={cn(
								"text-[11px] tabular-nums",
								tree.isCollapsed
									? "text-muted-foreground/70"
									: "text-muted-foreground",
							)}
						>
							{tree.fileCount}
						</span>
					</button>
				)}
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={onToggleCollapseAll}
							aria-label={
								areAllFilesCollapsed
									? t({
											message: "Expand all files",
										})
									: t({
											message: "Collapse all files",
										})
							}
							className="flex items-center justify-center rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
						>
							{areAllFilesCollapsed ? (
								<LuUnfoldVertical className="size-3.5" strokeWidth={1.5} />
							) : (
								<LuFoldVertical className="size-3.5" strokeWidth={1.5} />
							)}
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{areAllFilesCollapsed ? (
							<Trans>Expand all files</Trans>
						) : (
							<Trans>Collapse all files</Trans>
						)}
					</TooltipContent>
				</Tooltip>
				{children != null && (
					<>
						<div className="mx-0.5 h-4 w-px bg-border" />
						{children}
					</>
				)}
			</div>
			<div className="flex items-center gap-1">
				{commentNav != null && commentNav.total > 0 && (
					<>
						<div className="flex items-center gap-0.5 rounded-md bg-muted/50 px-1.5 py-0.5">
							{/* Name the cluster: bare up/down chevrons next to a counter
							    read as generic paging, not comment navigation. */}
							<LuMessageSquare
								aria-hidden="true"
								className="size-3.5 shrink-0 text-muted-foreground"
								strokeWidth={1.5}
							/>
							<span className="mr-0.5 ml-1 text-[11px] font-medium text-muted-foreground">
								<Trans>Comments</Trans>
							</span>
							<span className="min-w-[3ch] text-center text-[11px] tabular-nums text-muted-foreground">
								{commentNav.focusedIndex != null
									? commentNav.focusedIndex + 1
									: "–"}
								/{commentNav.total}
							</span>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={commentNav.onPrev}
										aria-label={t({
											message: "Previous comment",
										})}
										className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
									>
										<LuChevronUp className="size-3.5" strokeWidth={1.5} />
									</button>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									<Trans>Previous comment</Trans>
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={commentNav.onNext}
										aria-label={t({
											message: "Next comment",
										})}
										className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
									>
										<LuChevronDown className="size-3.5" strokeWidth={1.5} />
									</button>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									<Trans>Next comment</Trans>
								</TooltipContent>
							</Tooltip>
						</div>
						<div className="mx-0.5 h-4 w-px bg-border" />
					</>
				)}
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => updateSetting("diffStyle", "unified")}
							aria-label={t({
								message: "Unified view",
							})}
							aria-pressed={diffStyle === "unified"}
							className={toggleClass(diffStyle === "unified")}
						>
							<LuRows2 className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<Trans>Unified view</Trans>
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							onClick={() => updateSetting("diffStyle", "split")}
							aria-label={t({
								message: "Split view",
							})}
							aria-pressed={diffStyle === "split"}
							className={toggleClass(diffStyle === "split")}
						>
							<LuColumns2 className="size-3.5" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						<Trans>Split view</Trans>
					</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
