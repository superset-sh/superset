"use client";

import { Trans, useLingui } from "@lingui/react/macro";
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
	const { t } = useLingui();
	useFramePointerDown(useCallback(() => onOpenChange(false), [onOpenChange]));

	const served = page.servedVersion;
	const updatedAgo = relativeTime(page.updatedAt);
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
					{isOwner ? (
						<Trans id="ui.pageTitleMenu.pageByYou">Page by you</Trans>
					) : (
						(page.owner?.name ??
						t({ id: "ui.pageTitleMenu.page", message: "Page" }))
					)}{" "}
					<Trans id="ui.pageTitleMenu.updated">· updated {updatedAgo}</Trans>
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
					<Trans id="ui.pageTitleMenu.share">Share</Trans>
				</DropdownMenuItem>

				<DropdownMenuSub>
					<DropdownMenuSubTrigger className={itemClass}>
						<History className={iconClass} />
						<Trans id="ui.pageTitleMenu.versionHistory">Version history</Trans>
						<span className="text-muted-foreground tabular-nums">
							{versions.length}
						</span>
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent className="w-56">
						{versions.length === 0 ? (
							<DropdownMenuItem disabled className={itemClass}>
								<Trans id="ui.pageTitleMenu.noVersions">No versions yet</Trans>
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
										{entry.label ??
											t({
												id: "ui.pageTitleMenu.versionLabel",
												message: `Version ${entry.version}`,
											})}
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
							<Trans id="ui.pageTitleMenu.deletePage">Delete page</Trans>
						</DropdownMenuItem>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
