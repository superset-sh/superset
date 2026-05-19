import { Checkbox } from "@superset/ui/checkbox";
import { useCallback } from "react";
import type { ChangeCategory, ChangedFile } from "shared/changes-types";
import {
	getStatusColor,
	getStatusIndicator,
} from "../../../../../RightSidebar/ChangesView/utils";
import { createFileKey, useScrollContext } from "../../../../context";

interface StickyFileHeaderProps {
	file: ChangedFile;
	category: ChangeCategory;
	commitHash?: string;
	worktreePath: string;
}

export function StickyFileHeader({
	file,
	category,
	commitHash,
	worktreePath,
}: StickyFileHeaderProps) {
	const { viewedFiles, setFileViewed } = useScrollContext();
	const fileKey = createFileKey(file, category, commitHash, worktreePath);
	const isViewed = viewedFiles.has(fileKey);
	const statusBadgeColor = getStatusColor(file.status);
	const statusIndicator = getStatusIndicator(file.status);

	const handleViewedChange = useCallback(
		(checked: boolean) => {
			setFileViewed(fileKey, checked);
		},
		[fileKey, setFileViewed],
	);

	return (
		<div className="border-b border-border bg-muted/95 backdrop-blur-sm">
			<div className="flex items-center gap-2 px-3 py-1.5">
				<span className={`shrink-0 flex items-center ${statusBadgeColor}`}>
					{statusIndicator}
				</span>

				<span className="text-xs truncate min-w-0 font-mono">
					{file.path}
				</span>

				<div className="flex-1" />

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

				{/* biome-ignore lint/a11y/useKeyWithClickEvents: checkbox handles keyboard events */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: wrapper for checkbox */}
				<div
					className="flex items-center gap-1.5 shrink-0 text-xs cursor-pointer select-none"
					onClick={(e) => e.stopPropagation()}
				>
					<Checkbox
						id={`sticky-viewed-${fileKey}`}
						checked={isViewed}
						onCheckedChange={(checked) =>
							handleViewedChange(checked === true)
						}
						className="size-3.5 border-muted-foreground/50"
					/>
					<label
						htmlFor={`sticky-viewed-${fileKey}`}
						className="text-muted-foreground cursor-pointer"
					>
						Viewed
					</label>
				</div>
			</div>
		</div>
	);
}
