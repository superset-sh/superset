import { FONT_SIZE_LIMITS } from "@superset/shared/settings-constraints";
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

	const zoomTerminalFont = async (direction: ZoomDirection) => {
		if (direction === "reset") {
			setFontSettings.mutate({ terminalFontSize: null });
			return;
		}
		const current =
			utils.settings.getFontSettings.getData() ??
			(await utils.settings.getFontSettings.fetch());
		const size = current.terminalFontSize ?? DEFAULT_TERMINAL_FONT_SIZE;
		const delta = direction === "in" ? TERMINAL_FONT_STEP : -TERMINAL_FONT_STEP;
		const next = Math.min(
			FONT_SIZE_LIMITS.max,
			Math.max(FONT_SIZE_LIMITS.min, size + delta),
		);
		if (next !== size) setFontSettings.mutate({ terminalFontSize: next });
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
