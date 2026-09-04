import { useRef } from "react";
import { useFontSettingsMutation } from "renderer/hooks/useFontSettingsMutation";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { browserRuntimeRegistry } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";
import { resolveZoomTarget } from "./resolveZoomTarget";
import {
	stepTerminalFontSize,
	type ZoomDirection,
} from "./stepTerminalFontSize";

/**
 * Cmd/Ctrl +, -, 0 scoped to keyboard focus: a terminal steps its font size,
 * a browser pane steps its page zoom, anything else steps the app's page zoom
 * (what the View menu's zoom roles do on click).
 */
export function useZoomHotkeys() {
	const utils = electronTrpc.useUtils();
	const setFontSettings = useFontSettingsMutation();
	const zoomWindow = electronTrpc.window.zoom.useMutation();
	// Size requested by the latest keypress. The mutation's optimistic cache
	// write lands a tick later (after query cancellation), so key-repeat
	// presses in that window would all read the same stale size.
	const requestedSizeRef = useRef<number | null | undefined>(undefined);
	// A press that had to fetch a cold cache must not apply after a later press.
	const opIdRef = useRef(0);

	const zoomTerminalFont = async (direction: ZoomDirection) => {
		const opId = ++opIdRef.current;
		const current =
			requestedSizeRef.current !== undefined
				? requestedSizeRef.current
				: (
						utils.settings.getFontSettings.getData() ??
						(await utils.settings.getFontSettings.fetch())
					).terminalFontSize;
		if (opId !== opIdRef.current) return;
		const next = stepTerminalFontSize(current, direction);
		if (next === undefined) return;
		requestedSizeRef.current = next;
		setFontSettings.mutate(
			{ terminalFontSize: next },
			{
				onSettled: () => {
					requestedSizeRef.current = undefined;
				},
			},
		);
	};

	const zoom = (direction: ZoomDirection) => {
		const target = resolveZoomTarget(document.activeElement, (el) =>
			browserRuntimeRegistry.getPaneIdForWebview(el),
		);
		switch (target.kind) {
			case "terminal":
				void zoomTerminalFont(direction);
				return;
			case "browser":
				browserRuntimeRegistry.stepZoom(target.paneId, direction);
				return;
			case "app":
				zoomWindow.mutate({ direction });
		}
	};

	useHotkey("ZOOM_IN", () => zoom("in"));
	useHotkey("ZOOM_OUT", () => zoom("out"));
	useHotkey("ZOOM_RESET", () => zoom("reset"));
}
