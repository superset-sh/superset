import { useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Tracks the current Electron page-zoom factor (1 = 100%).
 *
 * Electron page zoom scales renderer CSS pixels, but macOS native traffic
 * lights stay fixed in native window coordinates. Chrome that reserves space
 * for the traffic lights counter-scales that reserved inset by `1 / zoomFactor`
 * so it keeps a constant physical width across zoom levels.
 *
 * Page zoom always changes `window.devicePixelRatio`, so every zoom change
 * (menu, keyboard, or wheel) is detected with a `matchMedia` resolution
 * listener; on each change we re-read the authoritative factor from the main
 * process. Reading from main on change also means the renderer can't miss the
 * persisted zoom that main applies on `did-finish-load`.
 */
export function useZoomFactor(): number {
	const utils = electronTrpc.useUtils();
	const [zoomFactor, setZoomFactor] = useState(1);

	useEffect(() => {
		let cancelled = false;
		let media: MediaQueryList | null = null;

		const refresh = async () => {
			const factor = await utils.window.getZoomFactor.fetch();
			if (!cancelled && factor > 0) setZoomFactor(factor);
		};

		const handleChange = () => {
			void refresh();
			arm();
		};

		// Re-arm a media query keyed to the current devicePixelRatio; it fires
		// as soon as the resolution (i.e. the zoom factor) moves away from it.
		const arm = () => {
			media?.removeEventListener("change", handleChange);
			media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
			media.addEventListener("change", handleChange);
		};

		void refresh();
		arm();

		return () => {
			cancelled = true;
			media?.removeEventListener("change", handleChange);
		};
	}, [utils]);

	return zoomFactor;
}
