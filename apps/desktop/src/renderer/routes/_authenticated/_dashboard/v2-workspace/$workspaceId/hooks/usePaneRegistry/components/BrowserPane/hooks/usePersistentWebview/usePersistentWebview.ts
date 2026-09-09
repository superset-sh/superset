import type { RendererContext } from "@superset/panes";
import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { replayForwardedKey } from "renderer/hotkeys";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type {
	BrowserPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { browserRuntimeRegistry } from "../../browserRuntimeRegistry";
import { DEFAULT_BROWSER_URL } from "../../constants";

interface UsePersistentWebviewOptions {
	paneId: string;
	ctx: RendererContext<PaneViewerData>;
}

export function usePersistentWebview({
	paneId,
	ctx,
}: UsePersistentWebviewOptions) {
	const placeholderRef = useRef<HTMLDivElement | null>(null);
	// The registry's host layer above this pane's webview; pane UI that must
	// cover the page portals into it. Null until attached.
	const [overlayContainer, setOverlayContainer] = useState<HTMLElement | null>(
		null,
	);
	const ctxRef = useRef(ctx);
	ctxRef.current = ctx;
	// Workspace scoping for the browser bridge (CLI/agent control). Panes only
	// render inside the $workspaceId route, so this is always present.
	const { workspaceId } = useParams({ strict: false });

	const paneData = ctx.pane.data as BrowserPaneData;
	// Read through a ref so attach keys on paneId alone: navigation echoes
	// updating pane data must not re-attach, but a replacePane (new paneId on
	// the same component instance — e.g. opening a link into an existing
	// browser pane) must attach with the new pane's URL, not the URL captured
	// at first mount.
	const attachUrlRef = useRef(paneData.url || DEFAULT_BROWSER_URL);
	attachUrlRef.current = paneData.url || DEFAULT_BROWSER_URL;

	useEffect(() => {
		const placeholder = placeholderRef.current;
		if (!placeholder) return;

		browserRuntimeRegistry.attach(
			paneId,
			placeholder,
			attachUrlRef.current,
			workspaceId ?? "",
			({ url, pageTitle, faviconUrl }) => {
				const current = ctxRef.current.pane.data as BrowserPaneData;
				if (
					current.url === url &&
					current.pageTitle === pageTitle &&
					current.faviconUrl === faviconUrl
				)
					return;
				ctxRef.current.actions.updateData({
					...current,
					url,
					pageTitle,
					faviconUrl,
				});
			},
			() => {
				void ctxRef.current.actions.close();
			},
		);
		setOverlayContainer(browserRuntimeRegistry.getOverlayContainer(paneId));

		return () => {
			browserRuntimeRegistry.detach(paneId);
			setOverlayContainer(null);
		};
	}, [paneId, workspaceId]);

	useEffect(() => {
		const newWindowSub = electronTrpcClient.browser.onNewWindow.subscribe(
			{ paneId },
			{
				onData: ({ url }: { url: string }) => {
					ctxRef.current.actions.split("right", {
						kind: "browser",
						data: { url } as BrowserPaneData,
					});
				},
			},
		);
		const contextMenuSub =
			electronTrpcClient.browser.onContextMenuAction.subscribe(
				{ paneId },
				{
					onData: ({ action, url }: { action: string; url: string }) => {
						if (action === "open-in-split") {
							ctxRef.current.actions.split("right", {
								kind: "browser",
								data: { url } as BrowserPaneData,
							});
						}
					},
				},
			);
		// `ctx.actions.close()` runs the standard onBeforeClose hook chain,
		// matching the renderer CLOSE_PANE hotkey path.
		const closePaneSub = electronTrpcClient.browser.onClosePane.subscribe(
			{ paneId },
			{
				onData: () => {
					void ctxRef.current.actions.close();
				},
			},
		);
		const reloadPaneSub = electronTrpcClient.browser.onReloadPane.subscribe(
			{ paneId },
			{
				onData: () => {
					browserRuntimeRegistry.reload(paneId);
				},
			},
		);
		// Chords the main process suppressed in the focused guest, replayed
		// onto the host document so react-hotkeys-hook picks them up.
		const keyForwardSub = electronTrpcClient.browser.onKeyForward.subscribe(
			{ paneId },
			{ onData: replayForwardedKey },
		);
		return () => {
			newWindowSub.unsubscribe();
			contextMenuSub.unsubscribe();
			closePaneSub.unsubscribe();
			reloadPaneSub.unsubscribe();
			keyForwardSub.unsubscribe();
		};
	}, [paneId]);

	const goBack = useCallback(() => {
		browserRuntimeRegistry.goBack(paneId);
	}, [paneId]);

	const goForward = useCallback(() => {
		browserRuntimeRegistry.goForward(paneId);
	}, [paneId]);

	const reload = useCallback(() => {
		browserRuntimeRegistry.reload(paneId);
	}, [paneId]);

	const navigateTo = useCallback(
		(url: string) => {
			browserRuntimeRegistry.navigate(paneId, url);
		},
		[paneId],
	);

	return {
		placeholderRef,
		overlayContainer,
		goBack,
		goForward,
		reload,
		navigateTo,
	};
}
