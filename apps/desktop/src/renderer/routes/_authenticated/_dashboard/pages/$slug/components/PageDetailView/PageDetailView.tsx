import { useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	CommentModeButton,
	PageHeader as PageTitleBar,
	PageViewers,
} from "@superset/ui/page-comments";
import { Spinner } from "@superset/ui/spinner";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { PageViewer } from "renderer/routes/_authenticated/_dashboard/components/PageViewer";
import { usePageHeaderData } from "renderer/routes/_authenticated/_dashboard/hooks/usePageHeaderData";

interface PageDetailViewProps {
	slug: string;
}

export function PageDetailView({ slug }: PageDetailViewProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const [commentsEnabled, setCommentsEnabled] = useState(false);
	const [previewVersion, setPreviewVersion] = useState<number | null>(null);
	const {
		page,
		versions,
		threads,
		currentUserId,
		onSetVisibility,
		onSetSharedVersion,
		onRename,
		onRefresh,
		onDelete,
	} = usePageHeaderData({ slug, version: previewVersion });

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
			className="size-7 shrink-0 text-muted-foreground"
		>
			<ArrowLeft className="size-4" />
		</Button>
	);

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			{page ? (
				<PageHeader
					className="shadow-[inset_0_-1px_0_var(--border)]"
					contentClassName="px-2"
				>
					<PageTitleBar
						className="h-full min-w-0 flex-1 border-b-0 px-0"
						fillerClassName="drag"
						page={page}
						versions={versions}
						currentUserId={currentUserId}
						leading={backButton}
						trailing={
							<>
								<PageViewers pageId={page.id} className="mr-1" />
								<CommentModeButton
									enabled={commentsEnabled}
									openCount={
										threads.filter((thread) => !thread.resolved).length
									}
									onToggle={() => setCommentsEnabled(!commentsEnabled)}
								/>
							</>
						}
						onSetVisibility={onSetVisibility}
						onSetSharedVersion={onSetSharedVersion}
						onRename={onRename}
						onRefresh={onRefresh}
						onPreviewVersion={setPreviewVersion}
						previewVersion={
							previewVersion === page.servedVersion ? null : previewVersion
						}
						onDelete={async () => {
							await onDelete();
							goBack();
						}}
					/>
				</PageHeader>
			) : (
				<PageHeader
					className="shadow-[inset_0_-1px_0_var(--border)]"
					contentClassName="px-2"
					start={
						<>
							{backButton}
							<Spinner className="size-3.5" />
						</>
					}
				/>
			)}
			<div className="min-h-0 min-w-0 flex-1">
				<PageViewer
					key={slug}
					slug={slug}
					version={previewVersion}
					commentsEnabled={commentsEnabled}
					onCommentsEnabledChange={setCommentsEnabled}
				/>
			</div>
		</div>
	);
}
