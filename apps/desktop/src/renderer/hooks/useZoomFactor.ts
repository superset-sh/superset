import { useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Tracks the Electron page-zoom factor (1 = 100%), re-read from main on every
 * zoom change. Lets chrome counter-scale by `1 / zoomFactor` to stay aligned
 * with the macOS traffic lights, which don't move under page zoom.
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

		// Re-arm a media query at the current resolution; it fires as soon as
		// the zoom factor moves away from it.
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
