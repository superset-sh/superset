import type { WorkspaceStore } from "@superset/panes";
import { env } from "renderer/env.renderer";
import {
	type FolderLinkAction,
	type LinkAction,
	type ModifierEvent,
	PULL_REQUEST_LINKS,
	tierFor,
} from "renderer/lib/clickPolicy";
import {
	type PullRequestRef,
	pullRequestRefFromBareUrl,
	pullRequestRefFromUrl,
} from "renderer/lib/github/pullRequestRef";
import { parseSupersetPageUrl } from "renderer/lib/parseSupersetPageUrl";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type { RightPaneLinkTarget } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/providers/RightPaneLinkTargetProvider";
import type {
	OpenFile,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { openPagePaneInStore } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/openPagePaneInStore";
import { openPullRequestPaneInStore } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/openPullRequestPaneInStore";
import { openUrlInRightPane } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/openUrlInRightPane";
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
	rightPane?: RightPaneLinkTarget | null;
}

export function terminalPullRequestLinkAction(
	event: ModifierEvent,
	url: string,
): LinkAction | null {
	if (event.metaKey || event.ctrlKey) return null;
	if (!pullRequestRefFromBareUrl(url)) return null;
	return event.shiftKey ? "external" : "pane";
}

/**
 * Chat shows every pull request URL as a badge, so the badge opens the pane
 * even when the URL names a file or a comment; a modifier click reaches
 * GitHub, where that anchor still works. Terminals keep those deep links in
 * a browser pane: there the URL is all the reader sees.
 */
export function runChatPullRequestLink(
	deps: Pick<TerminalLinkActionDeps, "store" | "rightPane">,
	url: string,
	event: ModifierEvent,
): boolean {
	const pullRequest = pullRequestRefFromUrl(url);
	if (!pullRequest) return false;
	const action = PULL_REQUEST_LINKS[tierFor(event, "2-tier")] ?? "pane";
	if (action === "external") openUrlExternally(url);
	else openPullRequestPane(deps, pullRequest, action);
	return true;
}

function openUrlExternally(url: string): void {
	electronTrpcClient.external.openUrl.mutate(url).catch((error) => {
		console.error("[v2 Terminal] Failed to open URL:", url, error);
	});
}

function openPullRequestPane(
	deps: Pick<TerminalLinkActionDeps, "store" | "rightPane">,
	pullRequest: PullRequestRef,
	action: Exclude<LinkAction, "external">,
): void {
	if (deps.rightPane) {
		deps.rightPane.reveal();
		openPullRequestPaneInStore(deps.rightPane.store, pullRequest);
		return;
	}
	openPullRequestPaneInStore(
		deps.store,
		pullRequest,
		action === "newTab" ? "tab" : "split",
	);
}

export function runUrlLinkAction(
	deps: Pick<TerminalLinkActionDeps, "store" | "rightPane">,
	url: string,
	action: LinkAction,
): void {
	if (action === "external") {
		openUrlExternally(url);
		return;
	}
	const pullRequest = pullRequestRefFromBareUrl(url);
	if (pullRequest) {
		openPullRequestPane(deps, pullRequest, action);
		return;
	}
	const pageSlug = parseSupersetPageUrl(url, env.NEXT_PUBLIC_WEB_URL);
	if (deps.rightPane) {
		deps.rightPane.reveal();
		if (pageSlug) {
			openPagePaneInStore(deps.rightPane.store, { slug: pageSlug }, "tab");
			return;
		}
		openUrlInRightPane(deps.rightPane.store, url);
		return;
	}
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
