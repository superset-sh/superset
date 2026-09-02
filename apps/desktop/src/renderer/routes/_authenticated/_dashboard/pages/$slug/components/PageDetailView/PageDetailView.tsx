import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { CommentModeButton, PageHeader } from "@superset/ui/page-comments";
import { Spinner } from "@superset/ui/spinner";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { PageViewer } from "renderer/routes/_authenticated/_dashboard/components/PageViewer";
import { usePageHeaderData } from "renderer/routes/_authenticated/_dashboard/hooks/usePageHeaderData";

interface PageDetailViewProps {
	slug: string;
}

export function PageDetailView({ slug }: PageDetailViewProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const [commentsEnabled, setCommentsEnabled] = useState(false);
	const {
		page,
		versions,
		threads,
		currentUserId,
		onSetVisibility,
		onSetSharedVersion,
		onDelete,
	} = usePageHeaderData({ slug });

	const goBack = () => navigate({ to: "/pages" });

	const backButton = (
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			aria-label={t({
				message: "Back to pages",
			})}
			onClick={goBack}
			className="no-drag size-7 shrink-0 text-muted-foreground"
		>
			<ArrowLeft className="size-4" />
		</Button>
	);

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			{page ? (
				<PageHeader
					className="drag"
					page={page}
					versions={versions}
					currentUserId={currentUserId}
					leading={backButton}
					trailing={
						<CommentModeButton
							enabled={commentsEnabled}
							openCount={threads.filter((thread) => !thread.resolved).length}
							onToggle={() => setCommentsEnabled(!commentsEnabled)}
						/>
					}
					onSetVisibility={onSetVisibility}
					onSetSharedVersion={onSetSharedVersion}
					onDelete={async () => {
						await onDelete();
						goBack();
					}}
				/>
			) : (
				<div className="drag flex h-11 shrink-0 items-center gap-2 border-b px-2">
					{backButton}
					<Spinner className="size-3.5" />
				</div>
			)}
			<div className="min-h-0 min-w-0 flex-1">
				<PageViewer
					key={slug}
					slug={slug}
					commentsEnabled={commentsEnabled}
					onCommentsEnabledChange={setCommentsEnabled}
				/>
			</div>
		</div>
	);
}
