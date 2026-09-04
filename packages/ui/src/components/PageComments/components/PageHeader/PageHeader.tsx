"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { Share2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "../../../../lib/utils";
import { Button } from "../../../ui/button";
import { toast } from "../../../ui/sonner";
import { DeletePageDialog } from "./components/DeletePageDialog";
import { PageSharePopover } from "./components/PageSharePopover";
import { PageTitleMenu } from "./components/PageTitleMenu";
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
}

export function PageHeader({
	page,
	versions,
	currentUserId,
	leading,
	trailing,
	className,
	onSetVisibility,
	onSetSharedVersion,
	onDelete,
}: PageHeaderProps) {
	const { t } = useLingui();
	const [menuOpen, setMenuOpen] = useState(false);
	const [shareOpen, setShareOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	const isOwner =
		currentUserId !== undefined && currentUserId === page.createdByUserId;

	const pickVersion = async (version: number) => {
		if (page.sharedVersion !== null && version === page.sharedVersion) return;
		try {
			await onSetSharedVersion(version);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t({
							message: "Could not change the shared version",
						}),
			);
		}
	};

	return (
		<div
			className={cn(
				"flex h-11 shrink-0 items-center gap-2 border-b px-2",
				className,
			)}
		>
			{leading}
			<div className="no-drag flex min-w-0 items-center">
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
					onPickVersion={(version) => {
						setMenuOpen(false);
						void pickVersion(version);
					}}
				/>
				{!isOwner && page.owner ? (
					<span className="ml-2 min-w-0 truncate text-muted-foreground text-xs">
						{page.owner.name}
					</span>
				) : null}
			</div>

			<div className="no-drag ml-auto flex shrink-0 items-center gap-1">
				{trailing}
				<PageSharePopover
					page={page}
					versions={versions}
					editable={isOwner}
					open={shareOpen}
					onOpenChange={setShareOpen}
					onSetVisibility={onSetVisibility}
					onSetSharedVersion={onSetSharedVersion}
				>
					<Button size="xs" variant="ghost" className="gap-1.5">
						<Share2 className="size-3.5" />
						<Trans>Share</Trans>
					</Button>
				</PageSharePopover>
			</div>

			<DeletePageDialog
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				title={page.title}
				versionCount={versions.length}
				onConfirm={onDelete}
			/>
		</div>
	);
}
