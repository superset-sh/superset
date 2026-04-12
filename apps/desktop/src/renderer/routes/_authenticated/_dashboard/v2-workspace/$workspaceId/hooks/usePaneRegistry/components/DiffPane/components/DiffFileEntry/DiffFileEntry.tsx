import { toast } from "@superset/ui/sonner";
import { memo, useCallback, useRef, useState } from "react";
import type { ChangesetFile } from "../../../../../useChangeset";
import { DiffFileHeader } from "../DiffFileHeader";
import { WorkspaceDiff } from "../WorkspaceDiff";
import { useInView } from "./hooks/useInView";

const LINE_HEIGHT_PX = 20;
const HEADER_HEIGHT_PX = 44;
const COLLAPSED_HEIGHT_PX = 48;
const MIN_HEIGHT_PX = 60;
const LARGE_DIFF_THRESHOLD_LINES = 250;
const PLACEHOLDER_HEIGHT_PX = 260;

function isLargeDiff(file: ChangesetFile): boolean {
	return file.additions + file.deletions > LARGE_DIFF_THRESHOLD_LINES;
}

function expandedHeight(file: ChangesetFile): number {
	const content = (file.additions + file.deletions) * LINE_HEIGHT_PX;
	return Math.max(MIN_HEIGHT_PX, HEADER_HEIGHT_PX + content);
}

interface DiffFileEntryProps {
	file: ChangesetFile;
	workspaceId: string;
	diffStyle: "split" | "unified";
	collapsed: boolean;
	onSetCollapsed: (path: string, value: boolean) => void;
	viewed: boolean;
	onSetViewed: (path: string, next: boolean) => void;
	onOpenFile: (path: string) => void;
}

export const DiffFileEntry = memo(function DiffFileEntry({
	file,
	workspaceId,
	diffStyle,
	collapsed,
	onSetCollapsed,
	viewed,
	onSetViewed,
	onOpenFile,
}: DiffFileEntryProps) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const isNear = useInView(wrapperRef, { rootMargin: "2000px 0px" });
	const hasBeenNearRef = useRef(false);
	if (isNear) hasBeenNearRef.current = true;

	const [showLargeDiff, setShowLargeDiff] = useState(false);
	const [expandUnchanged, setExpandUnchanged] = useState(false);
	const large = isLargeDiff(file);

	const handleToggleCollapsed = useCallback(
		() => onSetCollapsed(file.path, !collapsed),
		[onSetCollapsed, file.path, collapsed],
	);
	const handleToggleViewed = useCallback(() => {
		const next = !viewed;
		onSetViewed(file.path, next);
		onSetCollapsed(file.path, next);
	}, [viewed, file.path, onSetViewed, onSetCollapsed]);
	const handleOpenFile = useCallback(() => {
		if (file.status === "deleted") {
			toast.error("File no longer exists", {
				description: `${file.path} was deleted in this change.`,
			});
			return;
		}
		onOpenFile(file.path);
	}, [file.status, file.path, onOpenFile]);
	const handleShowLargeDiff = useCallback(() => setShowLargeDiff(true), []);
	const handleToggleExpandUnchanged = useCallback(
		() => setExpandUnchanged((prev) => !prev),
		[],
	);

	if (large && !showLargeDiff) {
		return (
			<div
				ref={wrapperRef}
				data-diff-path={file.path}
				style={{
					minHeight: collapsed ? COLLAPSED_HEIGHT_PX : PLACEHOLDER_HEIGHT_PX,
				}}
			>
				<LargeDiffPlaceholder
					file={file}
					onShow={handleShowLargeDiff}
					collapsed={collapsed}
					onToggleCollapsed={handleToggleCollapsed}
					viewed={viewed}
					onToggleViewed={handleToggleViewed}
					onOpenFile={handleOpenFile}
				/>
			</div>
		);
	}

	const shouldMount = large ? showLargeDiff : hasBeenNearRef.current;

	return (
		<div
			ref={wrapperRef}
			data-diff-path={file.path}
			style={{
				minHeight: collapsed ? COLLAPSED_HEIGHT_PX : expandedHeight(file),
			}}
		>
			{shouldMount ? (
				<WorkspaceDiff
					workspaceId={workspaceId}
					path={file.path}
					status={file.status}
					source={file.source}
					additions={file.additions}
					deletions={file.deletions}
					diffStyle={diffStyle}
					expandUnchanged={expandUnchanged}
					onToggleExpandUnchanged={handleToggleExpandUnchanged}
					collapsed={collapsed}
					onToggleCollapsed={handleToggleCollapsed}
					viewed={viewed}
					onToggleViewed={handleToggleViewed}
					onOpenFile={handleOpenFile}
				/>
			) : null}
		</div>
	);
});

interface LargeDiffPlaceholderProps {
	file: ChangesetFile;
	onShow: () => void;
	collapsed: boolean;
	onToggleCollapsed: () => void;
	viewed: boolean;
	onToggleViewed: () => void;
	onOpenFile?: () => void;
}

function LargeDiffPlaceholder({
	file,
	onShow,
	collapsed,
	onToggleCollapsed,
	viewed,
	onToggleViewed,
	onOpenFile,
}: LargeDiffPlaceholderProps) {
	const total = file.additions + file.deletions;
	return (
		<div className="flex flex-col overflow-hidden rounded-md border border-border">
			<DiffFileHeader
				path={file.path}
				status={file.status}
				additions={file.additions}
				deletions={file.deletions}
				expandUnchanged={false}
				collapsed={collapsed}
				onToggleCollapsed={onToggleCollapsed}
				viewed={viewed}
				onToggleViewed={onToggleViewed}
				onOpenFile={onOpenFile}
			/>
			{!collapsed && (
				<div
					className="flex flex-col items-center justify-center gap-3 px-6 text-center"
					style={{ height: PLACEHOLDER_HEIGHT_PX - HEADER_HEIGHT_PX }}
				>
					<div className="text-sm font-medium text-foreground">
						Large diffs are not rendered by default
					</div>
					<div className="text-xs text-muted-foreground">
						{total.toLocaleString()} changed lines
					</div>
					<button
						type="button"
						onClick={onShow}
						className="mt-1 rounded border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
					>
						Show diff
					</button>
				</div>
			)}
		</div>
	);
}
