"use client";

import { type ReactNode, useState } from "react";
import { cn } from "../../../../lib/utils";
import { DeletePageDialog } from "./components/DeletePageDialog";
import { PageShareButton } from "./components/PageShareButton";
import { PageTitleMenu } from "./components/PageTitleMenu";
import { PageVersionBanner } from "./components/PageVersionBanner";
import { RenamePageDialog } from "./components/RenamePageDialog";
import type {
	PageHeaderActions,
	PageHeaderPage,
	PageHeaderVersion,
} from "./types";

interface PageHeaderProps extends PageHeaderActions {
	page: PageHeaderPage;
	versions: PageHeaderVersion[];
	currentUserId: string | undefined;
	leading?: ReactNode;
	trailing?: ReactNode;
	className?: string;
	/** The empty space between the title and the actions, e.g. a window-drag region. */
	fillerClassName?: string;
}

export function PageHeader({
	page,
	versions,
	currentUserId,
	leading,
	trailing,
	className,
	fillerClassName,
	onSetVisibility,
	onSetSharedVersion,
	onDelete,
	onRename,
	onRefresh,
	onPreviewVersion,
	previewVersion = null,
}: PageHeaderProps) {
	const [menuOpen, setMenuOpen] = useState(false);
	const [shareOpen, setShareOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [renameOpen, setRenameOpen] = useState(false);

	const isOwner =
		currentUserId !== undefined && currentUserId === page.createdByUserId;

	return (
		<>
			<div
				className={cn(
					"flex h-11 shrink-0 items-center gap-2 border-b px-2",
					className,
				)}
			>
				{leading}
				<div className="flex min-w-0 items-center">
					<PageTitleMenu
						page={page}
						versions={versions}
						editable={isOwner}
						isOwner={isOwner}
						open={menuOpen}
						onOpenChange={setMenuOpen}
						onShare={() => {
							setMenuOpen(false);
							setShareOpen(true);
						}}
						onDelete={() => {
							setMenuOpen(false);
							setDeleteOpen(true);
						}}
						onRename={() => setRenameOpen(true)}
						onRefresh={onRefresh}
						onPreviewVersion={onPreviewVersion}
					/>
					{!isOwner && page.owner ? (
						<span className="ml-2 min-w-0 truncate text-muted-foreground text-xs">
							{page.owner.name}
						</span>
					) : null}
				</div>

				<div className={cn("h-full min-w-0 flex-1", fillerClassName)} />
				<div className="flex shrink-0 items-center gap-1">
					{trailing}
					<PageShareButton
						page={page}
						versions={versions}
						editable={isOwner}
						open={shareOpen}
						onOpenChange={setShareOpen}
						onSetVisibility={onSetVisibility}
						onSetSharedVersion={onSetSharedVersion}
					/>
				</div>

				<DeletePageDialog
					open={deleteOpen}
					onOpenChange={setDeleteOpen}
					title={page.title}
					versionCount={versions.length}
					onConfirm={onDelete}
				/>

				<RenamePageDialog
					open={renameOpen}
					onOpenChange={setRenameOpen}
					title={page.title}
					onRename={onRename}
				/>
			</div>

			{previewVersion !== null ? (
				<PageVersionBanner
					version={previewVersion}
					onExit={() => onPreviewVersion(null)}
				/>
			) : null}
		</>
	);
}
