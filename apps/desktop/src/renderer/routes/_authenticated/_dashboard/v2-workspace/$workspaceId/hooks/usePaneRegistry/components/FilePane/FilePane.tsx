import type { RendererContext } from "@superset/panes";
import { useWorkspaceClient, workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useEffect } from "react";
import { FileSaveConflictDialog } from "renderer/components/FileSaveConflictDialog";
import { MarkdownResourceProvider } from "renderer/components/MarkdownRenderer/providers/MarkdownResourceProvider";
import type { LinkAction } from "renderer/lib/clickPolicy";
import { getPathDirectory } from "shared/absolute-paths";
import { useStore } from "zustand";
import {
	decodeBase64,
	useSharedFileDocument,
} from "../../../../state/fileDocumentStore";
import { fileAutoSave } from "../../../../state/fileDocumentStore/fileAutoSave";
import type { FilePaneData, PaneViewerData } from "../../../../types";
import { runUrlLinkAction } from "../../utils/runTerminalLinkAction";
import { ErrorState } from "./components/ErrorState";
import { ExternalChangeBanner } from "./components/ExternalChangeBanner";
import { LoadingState } from "./components/LoadingState";
import { OrphanedBanner } from "./components/OrphanedBanner";
import { SaveErrorBanner } from "./components/SaveErrorBanner";
import { resolveActivePaneView } from "./registry";

interface FilePaneProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
}

export function FilePane({ context, workspaceId }: FilePaneProps) {
	const data = context.pane.data as FilePaneData;
	const { filePath } = data;
	const isActiveTab = useStore(
		context.store,
		(state) => state.activeTabId === context.tab.id,
	);

	const document = useSharedFileDocument({
		workspaceId,
		absolutePath: filePath,
	});

	useEffect(
		() => () => {
			if (context.isActive) fileAutoSave.onFocusChange(document);
		},
		[context.isActive, document],
	);

	// Images a markdown file points at load through the workspace
	// filesystem, so they work for cloud sandboxes and never put a raw path
	// in the DOM. Root-relative ones need the worktree path, host-only data
	// the cloud-shaped workspace row doesn't carry.
	const { trpcClient } = useWorkspaceClient();
	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const readFile = useCallback(
		async (absolutePath: string) => {
			const result = await trpcClient.filesystem.readFile.query({
				workspaceId,
				absolutePath,
			});
			return typeof result.content === "string"
				? decodeBase64(result.content)
				: result.content;
		},
		[trpcClient, workspaceId],
	);

	// Follow the underlying file if it's renamed on disk — the store migrates
	// the entry, document.absolutePath returns the new path, and we reconcile
	// the pane's own filePath so the tab title updates.
	useEffect(() => {
		if (document.absolutePath !== data.filePath) {
			context.actions.updateData({
				...data,
				filePath: document.absolutePath,
			} as PaneViewerData);
		}
	}, [document.absolutePath, data, context.actions]);

	useEffect(() => {
		if (document.dirty && !context.pane.pinned) {
			context.actions.pin();
		}
	}, [document.dirty, context.pane.pinned, context.actions]);

	const handleChangeView = useCallback(
		(viewId: string) => {
			context.actions.updateData({
				...data,
				viewId,
			} as PaneViewerData);
		},
		[context.actions, data],
	);

	const handleForceView = useCallback(
		(viewId: string) => {
			context.actions.updateData({
				...data,
				forceViewId: viewId,
				viewId,
			} as PaneViewerData);
		},
		[context.actions, data],
	);

	const handleOpenUrl = useCallback(
		(url: string, action: LinkAction) => {
			runUrlLinkAction({ store: context.store }, url, action);
		},
		[context.store],
	);

	const handlePositionRevealed = useCallback(() => {
		const { pendingPosition: _pendingPosition, ...rest } = data;
		context.actions.updateData(rest);
	}, [context.actions, data]);

	// Content gating — LoadingState/ErrorState rendered before view resolution when
	// there's nothing for the view to consume.
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

	// The same resolution runs in FilePaneHeaderExtras — toggle + active view
	// stay in lockstep because both observe the same pane data + document.
	const { activeView } = resolveActivePaneView(document, data);
	if (!activeView) {
		return <ErrorState reason="binary-unsupported" />;
	}

	const ViewRenderer = activeView.Renderer;

	return (
		<div
			className="flex h-full w-full flex-col"
			onBlurCapture={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node)) {
					fileAutoSave.onFocusChange(document);
				}
			}}
		>
			<FileSaveConflictDialog
				open={document.conflict !== null && context.isActive && isActiveTab}
				filePath={filePath}
				localContent={
					document.content.kind === "text" ? document.content.value : ""
				}
				diskContent={document.conflict?.diskContent ?? null}
				isSaving={document.pendingSave}
				onOpenChange={(open) => {
					if (!open) void document.resolveConflict("keep");
				}}
				onKeepEditing={() => void document.resolveConflict("keep")}
				onReloadFromDisk={() => void document.resolveConflict("reload")}
				onOverwrite={() => void document.resolveConflict("overwrite")}
			/>
			{document.hasExternalChange && !document.orphaned && (
				<ExternalChangeBanner
					onCompare={() => void document.compareWithDisk()}
				/>
			)}
			{document.orphaned && (
				<OrphanedBanner
					dirty={document.dirty}
					onDiscard={() => void document.reload()}
				/>
			)}
			{document.saveError && (
				<SaveErrorBanner
					message={document.saveError.message}
					onRetry={() => void document.save()}
					onDismiss={() => document.clearSaveError()}
				/>
			)}
			<div className="min-h-0 min-w-0 flex-1">
				<MarkdownResourceProvider
					documentDirectory={getPathDirectory(document.absolutePath)}
					rootPath={workspaceQuery.data?.worktreePath ?? undefined}
					readFile={readFile}
					revision={
						"revision" in document.content
							? document.content.revision
							: undefined
					}
				>
					<ViewRenderer
						document={document}
						filePath={filePath}
						workspaceId={workspaceId}
						paneId={context.pane.id}
						isActive={context.isActive}
						onChangeView={handleChangeView}
						onForceView={handleForceView}
						onOpenUrl={handleOpenUrl}
						pendingPosition={data.pendingPosition}
						onPositionRevealed={handlePositionRevealed}
					/>
				</MarkdownResourceProvider>
			</div>
		</div>
	);
}
