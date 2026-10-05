import type { WorkspaceStore } from "@superset/panes";
import { env } from "renderer/env.renderer";
import type { FolderLinkAction, LinkAction } from "renderer/lib/clickPolicy";
import { parseSupersetPageUrl } from "renderer/lib/parseSupersetPageUrl";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type {
	OpenFile,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { openPagePaneInStore } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/openPagePaneInStore";
import { openUrlInV2Workspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/openUrlInV2Workspace";
import type { StoreApi } from "zustand/vanilla";

/**
 * Everything a terminal link action needs to reach the rest of the app.
 * TerminalPane (modifier-click) and the pane context menu ("Open in") both
 * build this, so the two paths cannot drift apart.
 */
export interface TerminalLinkActionDeps {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	onOpenFile: OpenFile;
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
	deps: Pick<TerminalLinkActionDeps, "store">,
	url: string,
	action: LinkAction,
): void {
	if (action === "external") {
		electronTrpcClient.external.openUrl.mutate(url).catch((error) => {
			console.error("[v2 Terminal] Failed to open URL:", url, error);
		});
		return;
	}
	const pageSlug = parseSupersetPageUrl(url, env.NEXT_PUBLIC_WEB_URL);
	if (pageSlug) {
		openPagePaneInStore(
			deps.store,
			{ slug: pageSlug },
			action === "newTab" ? "tab" : "split",
		);
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
	deps.onOpenFile(
		file.path,
		action === "newTab",
		file.row === undefined ? undefined : { line: file.row, column: file.col },
	);
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
