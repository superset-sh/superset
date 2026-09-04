import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { useCallback, useState } from "react";
import { ErrorState } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/FilePane/components/ErrorState";
import { FileViewToggle } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/FilePane/components/FileViewToggle";
import { LoadingState } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/FilePane/components/LoadingState";
import { SaveErrorBanner } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/FilePane/components/SaveErrorBanner";
import {
	orderForToggle,
	resolveActivePaneView,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/FilePane/registry";
import { splitFrontMatter } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/FilePane/registry/views/MarkdownPreviewView/splitFrontMatter";
import type { SharedFileDocument } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/state/fileDocumentStore";
import type { FilePaneData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

interface FileEditPaneProps {
	document: SharedFileDocument;
	filePath: string;
}

/**
 * Hosts the same view components workspace file panes use (CodeView,
 * MarkdownPreviewView, …) outside the pane-registry/tab-strip system, for
 * callers that only have a document + file path — no workspace, no pane, no
 * tab. Owns the Preview/Code toggle locally since there's no pane data to
 * persist the choice into.
 */
export function FileEditPane({ document, filePath }: FileEditPaneProps) {
	const [viewId, setViewId] = useState<string | undefined>(undefined);
	const [forceViewId, setForceViewId] = useState<string | undefined>(undefined);

	const handleChangeView = useCallback((next: string) => {
		setViewId(next);
	}, []);

	const handleForceView = useCallback((next: string) => {
		setForceViewId(next);
		setViewId(next);
	}, []);

	if (document.content.kind === "loading") {
		return <LoadingState />;
	}
	if (document.content.kind === "not-found" && !document.orphaned) {
		return <ErrorState reason="not-found" />;
	}
	if (document.content.kind === "too-large") {
		return (
			<ErrorState
				reason="too-large"
				onOpenAnyway={() => void document.loadUnlimited()}
			/>
		);
	}
	if (document.content.kind === "is-directory") {
		return <ErrorState reason="is-directory" />;
	}
	if (document.content.kind === "error") {
		return (
			<ErrorState
				reason="load-failed"
				message={document.content.error.message}
				onRetry={() => void document.reload()}
			/>
		);
	}

	const data: FilePaneData = { filePath, mode: "editor", viewId, forceViewId };
	const { views, activeView } = resolveActivePaneView(document, data);
	if (!activeView) {
		return <ErrorState reason="binary-unsupported" />;
	}

	const ViewRenderer = activeView.Renderer;
	const showToggle = views.length > 1 && !forceViewId;
	const hasFrontMatter =
		document.content.kind === "text" &&
		splitFrontMatter(document.content.value).frontMatter !== "";
	const showFrontMatterHint =
		activeView.id === "markdown-preview" && hasFrontMatter;

	return (
		<div className="flex h-full w-full flex-col">
			{document.saveError && (
				<SaveErrorBanner
					message={document.saveError.message}
					onRetry={() => void document.save()}
					onDismiss={() => document.clearSaveError()}
				/>
			)}
			<div className="flex items-center justify-between gap-2 border-b border-border/60 px-2 py-1">
				{showFrontMatterHint ? (
					<span className="min-w-0 truncate text-xs text-muted-foreground">
						<Trans>Front matter hidden — switch to Markdown to edit it</Trans>
					</span>
				) : (
					<span />
				)}
				<div className="flex shrink-0 items-center gap-2">
					{showToggle && (
						<FileViewToggle
							views={orderForToggle(views)}
							activeViewId={activeView.id}
							filePath={filePath}
							onChange={handleChangeView}
						/>
					)}
					{document.dirty && (
						<Button
							variant="outline"
							size="xs"
							disabled={document.pendingSave}
							onClick={() => void document.save()}
						>
							{document.pendingSave && <Spinner className="size-3" />}
							<Trans>Save</Trans>
						</Button>
					)}
				</div>
			</div>
			<div className="min-h-0 min-w-0 flex-1">
				<ViewRenderer
					document={document}
					filePath={filePath}
					workspaceId={document.workspaceId}
					paneId={document.id}
					isActive
					onChangeView={handleChangeView}
					onForceView={handleForceView}
					showFrontMatterNote={false}
				/>
			</div>
		</div>
	);
}
