import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	CommentModeButton,
	PageSharePopover,
} from "@superset/ui/page-comments";
import { Share2 } from "lucide-react";
import { usePageHeaderData } from "renderer/routes/_authenticated/_dashboard/hooks/usePageHeaderData";
import type { PagePaneData } from "../../../../types";
import { usePagePaneUi } from "../../hooks/usePagePaneUi";
import { pagePaneLabel } from "../../utils/pagePaneLabel";
import { PageWatcherMenu } from "./components/PageWatcherMenu";

interface PagePaneHeaderExtrasProps {
	data: PagePaneData;
	paneId: string;
	workspaceId: string;
}

export function PagePaneHeaderExtras({
	data,
	paneId,
	workspaceId,
}: PagePaneHeaderExtrasProps) {
	const { t } = useLingui();
	const {
		page,
		versions,
		threads,
		currentUserId,
		onSetVisibility,
		onSetSharedVersion,
	} = usePageHeaderData(data);
	const { commentsEnabled, setCommentsEnabled, shareOpen, setShareOpen } =
		usePagePaneUi(paneId);

	const owned =
		currentUserId !== undefined && currentUserId === page?.createdByUserId;

	return (
		<>
			{owned ? (
				<PageWatcherMenu
					workspaceId={workspaceId}
					pageId={page?.id}
					pageTitle={page?.title?.trim() || pagePaneLabel(data)}
					pageSlug={data.slug}
				/>
			) : null}
			<CommentModeButton
				compact
				enabled={commentsEnabled}
				openCount={threads.filter((thread) => !thread.resolved).length}
				onToggle={() => setCommentsEnabled(!commentsEnabled)}
			/>
			{page ? (
				<PageSharePopover
					page={page}
					versions={versions}
					editable={
						currentUserId !== undefined &&
						currentUserId === page.createdByUserId
					}
					open={shareOpen}
					onOpenChange={setShareOpen}
					onSetVisibility={onSetVisibility}
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
			) : null}
		</>
	);
}
