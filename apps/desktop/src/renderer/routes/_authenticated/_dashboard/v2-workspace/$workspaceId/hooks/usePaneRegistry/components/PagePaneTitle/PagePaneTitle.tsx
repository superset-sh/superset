import { DeletePageDialog, PageTitleMenu } from "@superset/ui/page-comments";
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
	const { page, versions, currentUserId, onSetSharedVersion, onDelete } =
		usePageHeaderData(data);
	const { setShareOpen } = usePagePaneUi(paneId);
	const [menuOpen, setMenuOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);

	if (!page) {
		return (
			<span className="flex min-w-0 items-center gap-2">
				<FileText className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="truncate text-xs">{pagePaneLabel(data)}</span>
			</span>
		);
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: keeps the pane drag from starting on the menu trigger
		<span
			className="flex min-w-0 items-center"
			onMouseDown={(event) => event.stopPropagation()}
		>
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
				onPickVersion={(version) => {
					setMenuOpen(false);
					void onSetSharedVersion(version);
				}}
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
		</span>
	);
}
