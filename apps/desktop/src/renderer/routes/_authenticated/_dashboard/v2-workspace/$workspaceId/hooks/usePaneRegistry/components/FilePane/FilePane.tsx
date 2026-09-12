import { useLingui } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import { alert } from "@superset/ui/atoms/Alert";
import { useWorkspaceClient, workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useEffect } from "react";
import { MarkdownResourceProvider } from "renderer/components/MarkdownRenderer/providers/MarkdownResourceProvider";
import { getBaseName } from "renderer/lib/pathBasename";
import { getPathDirectory } from "shared/absolute-paths";
import {
	decodeBase64,
	useSharedFileDocument,
} from "../../../../state/fileDocumentStore";
import type { FilePaneData, PaneViewerData } from "../../../../types";
import { ErrorState } from "./components/ErrorState";
import { LoadingState } from "./components/LoadingState";
import { OrphanedBanner } from "./components/OrphanedBanner";
import { SaveErrorBanner } from "./components/SaveErrorBanner";
import { resolveActivePaneView } from "./registry";

interface FilePaneProps {
	context: RendererContext<PaneViewerData>;
	workspaceId: string;
}

export function FilePane({ context, workspaceId }: FilePaneProps) {
	const { t } = useLingui();
	const data = context.pane.data as FilePaneData;
	const { filePath } = data;

	const document = useSharedFileDocument({
		workspaceId,
		absolutePath: filePath,
	});

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

	const hasConflict = document.conflict !== null;
	useEffect(() => {
		if (!hasConflict) return;
		const name = getBaseName(filePath);
		alert({
			title: t({
				message: `Do you want to save the changes you made to ${name}?`,
			}),
			description: t({
				message: "Your changes will be lost if you don't save them.",
			}),
			actions: [
				{
					label: t({ message: "Save" }),
					onClick: () => document.resolveConflict("overwrite"),
				},
				{
					label: t({
						message: "Don't Save",
					}),
					variant: "secondary",
					onClick: () => document.resolveConflict("reload"),
				},
				{
					label: t({ message: "Cancel" }),
					variant: "ghost",
					onClick: () => document.resolveConflict("keep"),
				},
			],
		});
	}, [hasConflict, document, filePath, t]);

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
		<div className="flex h-full w-full flex-col">
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
					/>
				</MarkdownResourceProvider>
			</div>
		</div>
	);
}
