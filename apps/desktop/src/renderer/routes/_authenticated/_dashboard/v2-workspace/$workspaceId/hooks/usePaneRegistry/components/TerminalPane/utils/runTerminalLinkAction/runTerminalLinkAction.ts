import type { WorkspaceStore } from "@superset/panes";
import { env } from "renderer/env.renderer";
import type { FolderLinkAction, LinkAction } from "renderer/lib/clickPolicy";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { PaneViewerData } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { openPagePaneInStore } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/openPagePaneInStore";
import { openUrlInV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/openUrlInV2Workspace";
import type { StoreApi } from "zustand/vanilla";
import { parseSupersetPageUrl } from "../parseSupersetPageUrl";

/**
 * Everything a terminal link action needs to reach the rest of the app.
 * TerminalPane (modifier-click) and the pane context menu ("Open in") both
 * build this, so the two paths cannot drift apart.
 */
export interface TerminalLinkActionDeps {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	isPagesEnabled: boolean;
	onOpenFile: (path: string, openInNewTab?: boolean) => void;
	onRevealPath: (path: string, options?: { isDirectory?: boolean }) => void;
	openInExternalEditor: (
		path: string,
		position?: { line?: number; column?: number },
	) => void;
	revealInFinder: (path: string, options?: { isDirectory?: boolean }) => void;
	/** Worktree root, when known. Outside it, "reveal" degrades to Finder. */
	worktreePath: string | undefined;
}

export function runUrlLinkAction(
	deps: TerminalLinkActionDeps,
	url: string,
	action: LinkAction,
): void {
	if (action === "external") {
		electronTrpcClient.external.openUrl.mutate(url).catch((error) => {
			console.error("[v2 Terminal] Failed to open URL:", url, error);
		});
		return;
	}
	const pageSlug = deps.isPagesEnabled
		? parseSupersetPageUrl(url, env.NEXT_PUBLIC_WEB_URL)
		: null;
	if (pageSlug) {
		openPagePaneInStore(deps.store, { slug: pageSlug });
		return;
	}
	openUrlInV2Workspace({
		store: deps.store,
		target: action === "newTab" ? "new-tab" : "current-tab",
		url,
	});
}

export function runFileLinkAction(
	deps: TerminalLinkActionDeps,
	file: { path: string; row?: number; col?: number },
	action: LinkAction,
): void {
	if (action === "external") {
		deps.openInExternalEditor(file.path, {
			line: file.row,
			column: file.col,
		});
		return;
	}
	deps.onOpenFile(file.path, action === "newTab");
}

export function runFolderLinkAction(
	deps: TerminalLinkActionDeps,
	path: string,
	intent: FolderLinkAction,
): void {
	if (intent === "external") {
		deps.openInExternalEditor(path);
		return;
	}
	if (intent === "finder") {
		deps.revealInFinder(path, { isDirectory: true });
		return;
	}
	deps.onRevealPath(path, { isDirectory: true });
}
