"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import {
	ChevronDown,
	FileText,
	History,
	Pencil,
	RotateCw,
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
import { VersionThumbnail } from "./components/VersionThumbnail";

interface PageTitleMenuProps {
	page: PageHeaderPage;
	versions: PageHeaderVersion[];
	editable: boolean;
	isOwner: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onShare: () => void;
	onDelete: () => void;
	onRename: () => void;
	onRefresh: () => void;
	onPreviewVersion: (version: number) => void;
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
	onRename,
	onRefresh,
	onPreviewVersion,
	compact = false,
}: PageTitleMenuProps) {
	const { t } = useLingui();
	useFramePointerDown(useCallback(() => onOpenChange(false), [onOpenChange]));

	const served = page.servedVersion;
	const updatedAgo = relativeTime(page.updatedAt);
	const itemClass = compact ? "text-xs" : undefined;
	const iconClass = compact ? "size-3.5" : undefined;

	const run = (action: () => void) => (event: Event) => {
		event.preventDefault();
		onOpenChange(false);
		action();
	};

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
					{isOwner ? (
						<Trans>Page by you</Trans>
					) : (
						(page.owner?.name ?? t({ message: "Page" }))
					)}{" "}
					<Trans>· updated {updatedAgo}</Trans>
				</DropdownMenuLabel>

				<DropdownMenuSeparator />

				{editable ? (
					<DropdownMenuItem className={itemClass} onSelect={run(onRename)}>
						<Pencil className={iconClass} />
						<Trans>Rename</Trans>
					</DropdownMenuItem>
				) : null}

				<DropdownMenuItem className={itemClass} onSelect={run(onShare)}>
					<Share2 className={iconClass} />
					<Trans>Share</Trans>
				</DropdownMenuItem>

				<DropdownMenuSub>
					<DropdownMenuSubTrigger className={itemClass}>
						<History className={iconClass} />
						<Trans>Version history</Trans>
						<span className="ml-auto text-muted-foreground tabular-nums">
							{versions.length}
						</span>
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="w-72 p-1">
						{versions.length === 0 ? (
							<DropdownMenuItem disabled className={itemClass}>
								<Trans>No versions yet</Trans>
							</DropdownMenuItem>
						) : (
							versions.map((entry) => (
								<DropdownMenuItem
									key={entry.version}
									className="gap-2.5 p-1.5"
									onSelect={run(() => onPreviewVersion(entry.version))}
								>
									<VersionThumbnail src={entry.thumbnailUrl} />
									<span className="flex min-w-0 flex-col">
										<span className="truncate text-sm">
											{entry.label ?? page.title}
										</span>
										<span className="truncate text-muted-foreground text-xs">
											<Trans>Version {entry.version}</Trans>
											{" · "}
											{relativeTime(entry.createdAt)}
											{entry.version === served ? (
												<>
													{" · "}
													<span className="text-primary">
														<Trans>Current</Trans>
													</span>
												</>
											) : null}
										</span>
									</span>
								</DropdownMenuItem>
							))
						)}
					</DropdownMenuSubContent>
				</DropdownMenuSub>

				<DropdownMenuItem className={itemClass} onSelect={run(onRefresh)}>
					<RotateCw className={iconClass} />
					<Trans>Refresh</Trans>
				</DropdownMenuItem>

				{editable ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							variant="destructive"
							className={itemClass}
							onSelect={run(onDelete)}
						>
							<Trash2 className={compact ? "size-3.5" : undefined} />
							<Trans>Delete page</Trans>
						</DropdownMenuItem>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
