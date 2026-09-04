import { FONT_SIZE_LIMITS } from "@superset/shared/settings-constraints";
import { useRef } from "react";
import { useFontSettingsMutation } from "renderer/hooks/useFontSettingsMutation";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { DEFAULT_TERMINAL_FONT_SIZE } from "renderer/lib/terminal/appearance";
import { browserRuntimeRegistry } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";
import { resolveZoomTarget } from "./resolveZoomTarget";

type ZoomDirection = "in" | "out" | "reset";

const TERMINAL_FONT_STEP = 1;

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
	const requestedSizeRef = useRef<number | null>(null);

	const setTerminalFontSize = (size: number | null) => {
		requestedSizeRef.current = size ?? DEFAULT_TERMINAL_FONT_SIZE;
		setFontSettings.mutate(
			{ terminalFontSize: size },
			{
				onSettled: () => {
					requestedSizeRef.current = null;
				},
			},
		);
	};

	const zoomTerminalFont = async (direction: ZoomDirection) => {
		if (direction === "reset") {
			setTerminalFontSize(null);
			return;
		}
		const current =
			utils.settings.getFontSettings.getData() ??
			(await utils.settings.getFontSettings.fetch());
		const size =
			requestedSizeRef.current ??
			current.terminalFontSize ??
			DEFAULT_TERMINAL_FONT_SIZE;
		const delta = direction === "in" ? TERMINAL_FONT_STEP : -TERMINAL_FONT_STEP;
		const next = Math.min(
			FONT_SIZE_LIMITS.max,
			Math.max(FONT_SIZE_LIMITS.min, size + delta),
		);
		if (next !== size) setTerminalFontSize(next);
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
