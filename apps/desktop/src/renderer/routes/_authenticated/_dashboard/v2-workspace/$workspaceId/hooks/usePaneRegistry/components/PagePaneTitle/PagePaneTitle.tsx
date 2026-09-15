import {
	DeletePageDialog,
	PageTitleMenu,
	RenamePageDialog,
} from "@superset/ui/page-comments";
import { FileText } from "lucide-react";
import { useState } from "react";
import { usePageHeaderData } from "renderer/routes/_authenticated/_dashboard/hooks/usePageHeaderData";
import type { PagePaneData } from "../../../../types";
import { usePagePaneUi } from "../../hooks/usePagePaneUi";
import { pagePaneLabel } from "../../utils/pagePaneLabel";

interface PagePaneTitleProps {
	data: PagePaneData;
	paneId: string;
	onClose: () => void;
}

export function PagePaneTitle({ data, paneId, onClose }: PagePaneTitleProps) {
	const { page, versions, currentUserId, onRename, onRefresh, onDelete } =
		usePageHeaderData(data);
	const { setShareOpen, setPreviewVersion } = usePagePaneUi(paneId);
	const [menuOpen, setMenuOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [renameOpen, setRenameOpen] = useState(false);

	if (!page) {
		return (
			<span className="flex min-w-0 items-center gap-2">
				<FileText className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="truncate text-xs">{pagePaneLabel(data)}</span>
			</span>
		);
	}

	return (
		<span className="flex min-w-0 items-center">
			<PageTitleMenu
				page={page}
				versions={versions}
				editable={
					currentUserId !== undefined && currentUserId === page.createdByUserId
				}
				isOwner={
					currentUserId !== undefined && currentUserId === page.createdByUserId
				}
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
				compact
				onRename={() => {
					setMenuOpen(false);
					setRenameOpen(true);
				}}
				onRefresh={onRefresh}
				onPreviewVersion={setPreviewVersion}
			/>
			<DeletePageDialog
				open={deleteOpen}
				onOpenChange={setDeleteOpen}
				title={page.title}
				versionCount={versions.length}
				onConfirm={async () => {
					await onDelete();
					onClose();
				}}
			/>
			<RenamePageDialog
				open={renameOpen}
				onOpenChange={setRenameOpen}
				title={page.title}
				onRename={onRename}
			/>
		</span>
	);
}
