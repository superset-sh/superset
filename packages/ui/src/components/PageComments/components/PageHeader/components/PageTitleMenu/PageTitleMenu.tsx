"use client";

import {
	Check,
	ChevronDown,
	FileText,
	History,
	Share2,
	Trash2,
} from "lucide-react";
import { useCallback } from "react";
import { cn } from "../../../../../../lib/utils";
import { Button } from "../../../../../ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "../../../../../ui/dropdown-menu";
import { useFramePointerDown } from "../../../../hooks/useFramePointerDown";
import { relativeTime } from "../../../../utils/relativeTime";
import type { PageHeaderPage, PageHeaderVersion } from "../../types";

interface PageTitleMenuProps {
	page: PageHeaderPage;
	versions: PageHeaderVersion[];
	editable: boolean;
	isOwner: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onShare: () => void;
	onDelete: () => void;
	onPickVersion: (version: number) => void;
	compact?: boolean;
}

export function PageTitleMenu({
	page,
	versions,
	editable,
	isOwner,
	open,
	onOpenChange,
	onShare,
	onDelete,
	onPickVersion,
	compact = false,
}: PageTitleMenuProps) {
	useFramePointerDown(useCallback(() => onOpenChange(false), [onOpenChange]));

	const served = page.servedVersion;
	const itemClass = compact ? "text-xs" : undefined;
	const iconClass = compact ? "size-3.5" : undefined;

	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<DropdownMenuTrigger asChild>
				<Button
					size="xs"
					variant="ghost"
					className={cn(
						"min-w-0",
						compact
							? "-ml-1 h-5 gap-1 px-1 font-[inherit] text-xs"
							: "gap-1.5 font-medium text-sm",
					)}
				>
					<FileText
						className={cn(
							"shrink-0 text-muted-foreground",
							compact ? "size-3" : "size-3.5",
						)}
					/>
					<span className="truncate">{page.title}</span>
					<ChevronDown
						className={cn(
							"shrink-0 text-muted-foreground",
							compact ? "size-2.5" : "size-3",
						)}
					/>
				</Button>
			</DropdownMenuTrigger>

			<DropdownMenuContent align="start" className="w-56">
				<DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
					{isOwner ? "Page by you" : (page.owner?.name ?? "Page")} · updated{" "}
					{relativeTime(page.updatedAt)}
				</DropdownMenuLabel>

				<DropdownMenuSeparator />

				<DropdownMenuItem
					className={itemClass}
					onSelect={(event) => {
						event.preventDefault();
						onShare();
					}}
				>
					<Share2 className={iconClass} />
					Share
				</DropdownMenuItem>

				<DropdownMenuSub>
					<DropdownMenuSubTrigger className={itemClass}>
						<History className={iconClass} />
						Version history
						<span className="text-muted-foreground tabular-nums">
							{versions.length}
						</span>
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="w-56">
						{versions.length === 0 ? (
							<DropdownMenuItem disabled className={itemClass}>
								No versions yet
							</DropdownMenuItem>
						) : (
							versions.map((entry) => (
								<DropdownMenuItem
									key={entry.version}
									disabled={!editable}
									className={cn(itemClass, "justify-between")}
									onSelect={() => onPickVersion(entry.version)}
								>
									<span className="truncate">
										{entry.label ?? `Version ${entry.version}`}
										<span className="ml-1 text-muted-foreground">
											{relativeTime(entry.createdAt)}
										</span>
									</span>
									{entry.version === served ? (
										<Check className="size-3.5 shrink-0 text-primary" />
									) : null}
								</DropdownMenuItem>
							))
						)}
					</DropdownMenuSubContent>
				</DropdownMenuSub>

				{editable ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							variant="destructive"
							className={itemClass}
							onSelect={(event) => {
								event.preventDefault();
								onDelete();
							}}
						>
							<Trash2 className={compact ? "size-3.5" : undefined} />
							Delete page
						</DropdownMenuItem>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
