import type { RendererContext } from "@superset/panes";
import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import {
	getDispatchChord,
	type HotkeyId,
	resolveHotkeyFromEvent,
	useHotkeyOverridesStore,
	useKeyboardPreferencesStore,
} from "renderer/hotkeys";
import { useKeyboardLayoutStore } from "renderer/hotkeys/stores/keyboardLayoutStore";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import type {
	BrowserPaneData,
	PaneViewerData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";
import { canonicalizeChord } from "shared/hotkey-chord";
import { browserRuntimeRegistry } from "../../browserRuntimeRegistry";
import { DEFAULT_BROWSER_URL } from "../../constants";

// Hotkeys the pane replays onto the host document when the guest forwards a
// keystroke. Scoped to tab switching and zoom: no registered menu accelerator
// (so replaying can't double-fire) and not page shortcuts. The main process is
// synced these chords so it suppresses + forwards only them — see the
// forwardable-chord sync below.
const FORWARDABLE_HOTKEYS = new Set<HotkeyId>([
	"ZOOM_IN",
	"ZOOM_OUT",
	"ZOOM_RESET",
	"PREV_TAB",
	"NEXT_TAB",
	"PREV_TAB_ALT",
	"NEXT_TAB_ALT",
	"JUMP_TO_TAB_1",
	"JUMP_TO_TAB_2",
	"JUMP_TO_TAB_3",
	"JUMP_TO_TAB_4",
	"JUMP_TO_TAB_5",
	"JUMP_TO_TAB_6",
	"JUMP_TO_TAB_7",
	"JUMP_TO_TAB_8",
	"JUMP_TO_TAB_9",
]);

interface UsePersistentWebviewOptions {
	paneId: string;
	ctx: RendererContext<PaneViewerData>;
}

export function usePersistentWebview({
	paneId,
	ctx,
}: UsePersistentWebviewOptions) {
	const placeholderRef = useRef<HTMLDivElement | null>(null);
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
		);

		return () => {
			browserRuntimeRegistry.detach(paneId);
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
		// Replay forwarded chords onto the host document so react-hotkeys-hook
		// picks them up. Re-gated to tab-switch hotkeys in case the main set lags.
		const keyForwardSub = electronTrpcClient.browser.onKeyForward.subscribe(
			{ paneId },
			{
				onData: (key) => {
					const init: KeyboardEventInit = {
						key: key.key,
						code: key.code,
						metaKey: key.meta,
						ctrlKey: key.control,
						altKey: key.alt,
						shiftKey: key.shift,
						bubbles: true,
						cancelable: true,
					};
					const id = resolveHotkeyFromEvent(new KeyboardEvent("keydown", init));
					if (!id || !FORWARDABLE_HOTKEYS.has(id)) return;
					document.dispatchEvent(new KeyboardEvent("keydown", init));
					// keyup balances react-hotkeys-hook's pressed-key set; without it
					// the key stays stuck as "pressed".
					document.dispatchEvent(new KeyboardEvent("keyup", init));
				},
			},
		);
		return () => {
			newWindowSub.unsubscribe();
			contextMenuSub.unsubscribe();
			closePaneSub.unsubscribe();
			reloadPaneSub.unsubscribe();
			keyForwardSub.unsubscribe();
		};
	}, [paneId]);

	// Sync the main process's forwardable-chord set with the current bindings,
	// recomputing on the same remap / layout / preference changes that rebuild
	// `resolveHotkeyFromEvent`'s index.
	useEffect(() => {
		const push = () => {
			const chords = [...FORWARDABLE_HOTKEYS]
				.map((id) => getDispatchChord(id))
				.filter((chord): chord is string => chord !== null)
				.map(canonicalizeChord);
			electronTrpcClient.browser.setForwardableChords
				.mutate({ chords })
				.catch((error) => {
					// Stale main-process suppression means webview tab-switch hotkeys
					// silently stop working — leave a trace.
					console.warn("[browser] failed to sync forwardable chords", error);
				});
		};
		push();
		const unsubs = [
			useHotkeyOverridesStore.subscribe(push),
			useKeyboardLayoutStore.subscribe(push),
			useKeyboardPreferencesStore.subscribe(push),
		];
		return () => {
			for (const unsub of unsubs) unsub();
		};
	}, []);

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
		goBack,
		goForward,
		reload,
		navigateTo,
	};
}
