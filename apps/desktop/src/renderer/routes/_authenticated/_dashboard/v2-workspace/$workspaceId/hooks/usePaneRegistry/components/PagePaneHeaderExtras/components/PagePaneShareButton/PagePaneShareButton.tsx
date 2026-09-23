import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	type PageHeaderActions,
	type PageHeaderPage,
	type PageHeaderVersion,
	PageSharePopover,
	usePendingVisibility,
} from "@superset/ui/page-comments";
import { Share2 } from "lucide-react";

interface PagePaneShareButtonProps {
	page: PageHeaderPage;
	versions: PageHeaderVersion[];
	editable: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSetVisibility: PageHeaderActions["onSetVisibility"];
	onSetSharedVersion: PageHeaderActions["onSetSharedVersion"];
}

export function PagePaneShareButton({
	page,
	versions,
	editable,
	open,
	onOpenChange,
	onSetVisibility,
	onSetSharedVersion,
}: PagePaneShareButtonProps) {
	const { t } = useLingui();
	const { visibility, setVisibility } = usePendingVisibility(
		page.id,
		page.visibility,
		onSetVisibility,
	);

	return (
		<PageSharePopover
			page={page}
			versions={versions}
			visibility={visibility}
			editable={editable}
			open={open}
			onOpenChange={onOpenChange}
			onSetVisibility={setVisibility}
			onSetSharedVersion={onSetSharedVersion}
		>
			<Button
				variant="ghost"
				size="icon"
				className="size-6 p-0 text-muted-foreground/60 hover:text-muted-foreground"
				aria-label={t({
					message: "Share page",
				})}
				title={t({
					message: "Share page",
				})}
			>
				<Share2 className="size-3.5" />
			</Button>
		</PageSharePopover>
	);
}
