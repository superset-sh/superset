import { CommentModeButton, PageShareButton } from "@superset/ui/page-comments";
import { usePageHeaderData } from "renderer/routes/_authenticated/_dashboard/hooks/usePageHeaderData";
import type { PagePaneData } from "../../../../types";
import { usePagePaneUi } from "../../hooks/usePagePaneUi";
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
				<PageWatcherMenu workspaceId={workspaceId} pageId={page?.id} />
			) : null}
			<CommentModeButton
				compact
				enabled={commentsEnabled}
				openCount={threads.filter((thread) => !thread.resolved).length}
				onToggle={() => setCommentsEnabled(!commentsEnabled)}
			/>
			{page ? (
				<PageShareButton
					compact
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
				/>
			) : null}
		</>
	);
}
