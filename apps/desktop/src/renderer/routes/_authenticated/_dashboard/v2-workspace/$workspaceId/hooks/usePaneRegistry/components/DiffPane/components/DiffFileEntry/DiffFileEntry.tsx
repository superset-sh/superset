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
const LARGE_PLACEHOLDER_HEIGHT_PX = 260;
const DELETED_PLACEHOLDER_HEIGHT_PX = 160;

type DeferReason = "large" | "deleted";

function deferReason(file: ChangesetFile): DeferReason | null {
	if (file.status === "deleted") return "deleted";
	if (file.additions + file.deletions > LARGE_DIFF_THRESHOLD_LINES)
		return "large";
	return null;
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
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
	onOpenInExternalEditor: (path: string) => void;
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
	onOpenInExternalEditor,
}: DiffFileEntryProps) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const isNear = useInView(wrapperRef, { rootMargin: "2000px 0px" });
	const hasBeenNearRef = useRef(false);
	if (isNear) hasBeenNearRef.current = true;

	const [showFullDiff, setShowFullDiff] = useState(false);
	const [expandUnchanged, setExpandUnchanged] = useState(false);
	const reason = deferReason(file);

	const handleToggleCollapsed = useCallback(
		() => onSetCollapsed(file.path, !collapsed),
		[onSetCollapsed, file.path, collapsed],
	);
	const handleToggleViewed = useCallback(() => {
		const next = !viewed;
		onSetViewed(file.path, next);
		onSetCollapsed(file.path, next);
	}, [viewed, file.path, onSetViewed, onSetCollapsed]);
	const showDeletedFileToast = useCallback(() => {
		toast.error("File no longer exists", {
			description: `${file.path} was deleted in this change.`,
		});
	}, [file.path]);
	const handleOpenFile = useCallback(
		(openInNewTab?: boolean) => {
			if (file.status === "deleted") {
				showDeletedFileToast();
				return;
			}
			onOpenFile(file.path, openInNewTab);
		},
		[file.status, file.path, onOpenFile, showDeletedFileToast],
	);
	const handleOpenInExternalEditor = useCallback(() => {
		if (file.status === "deleted") {
			showDeletedFileToast();
			return;
		}
		onOpenInExternalEditor(file.path);
	}, [file.status, file.path, onOpenInExternalEditor, showDeletedFileToast]);
	const handleShowFullDiff = useCallback(() => setShowFullDiff(true), []);
	const handleToggleExpandUnchanged = useCallback(
		() => setExpandUnchanged((prev) => !prev),
		[],
	);

	if (reason && !showFullDiff) {
		const placeholderHeight =
			reason === "deleted"
				? DELETED_PLACEHOLDER_HEIGHT_PX
				: LARGE_PLACEHOLDER_HEIGHT_PX;
		return (
			<div
				ref={wrapperRef}
				data-diff-path={file.path}
				style={{
					minHeight: collapsed ? COLLAPSED_HEIGHT_PX : placeholderHeight,
				}}
			>
				<DeferredDiffPlaceholder
					file={file}
					reason={reason}
					onShow={handleShowFullDiff}
					collapsed={collapsed}
					onToggleCollapsed={handleToggleCollapsed}
					viewed={viewed}
					onToggleViewed={handleToggleViewed}
					onOpenFile={handleOpenFile}
					onOpenInExternalEditor={handleOpenInExternalEditor}
				/>
			</div>
		);
	}

	const shouldMount = reason ? showFullDiff : hasBeenNearRef.current;

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
					onOpenInExternalEditor={handleOpenInExternalEditor}
				/>
			) : null}
		</div>
	);
});

interface DeferredDiffPlaceholderProps {
	file: ChangesetFile;
	reason: DeferReason;
	onShow: () => void;
	collapsed: boolean;
	onToggleCollapsed: () => void;
	viewed: boolean;
	onToggleViewed: () => void;
	onOpenFile?: (openInNewTab?: boolean) => void;
	onOpenInExternalEditor?: () => void;
}

function DeferredDiffPlaceholder({
	file,
	reason,
	onShow,
	collapsed,
	onToggleCollapsed,
	viewed,
	onToggleViewed,
	onOpenFile,
	onOpenInExternalEditor,
}: DeferredDiffPlaceholderProps) {
	const isDeleted = reason === "deleted";
	const fullHeight = isDeleted
		? DELETED_PLACEHOLDER_HEIGHT_PX
		: LARGE_PLACEHOLDER_HEIGHT_PX;
	const title = isDeleted
		? "This file was deleted"
		: "Large diffs are not rendered by default";
	const subtitle = isDeleted
		? null
		: `${(file.additions + file.deletions).toLocaleString()} changed lines`;

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
				onOpenInExternalEditor={onOpenInExternalEditor}
			/>
			{!collapsed && (
				<div
					className="flex flex-col items-center justify-center gap-2 px-6 text-center"
					style={{ height: fullHeight - HEADER_HEIGHT_PX }}
				>
					<div className="text-sm font-medium text-foreground">{title}</div>
					{subtitle && (
						<div className="text-xs text-muted-foreground">{subtitle}</div>
					)}
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
