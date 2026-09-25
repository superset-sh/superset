import {
	applyPageViewportZoom,
	NEXT_PAGE_VIEWPORT_ZOOM_SCRIPT,
	type PageViewportZoom,
} from "@superset/shared/page-zoom";

export function attachBrowserViewportZoom(webview: Electron.WebviewTag) {
	let generation = 0;
	const onReady = () => {
		const current = ++generation;
		const listen = async () => {
			while (generation === current) {
				try {
					const viewport: PageViewportZoom = await webview.executeJavaScript(
						NEXT_PAGE_VIEWPORT_ZOOM_SCRIPT,
					);
					if (generation !== current) return;
					applyPageViewportZoom(webview, viewport);
				} catch {
					return;
				}
			}
		};
		void listen();
	};
	webview.addEventListener("dom-ready", onReady);
	return () => {
		generation++;
		webview.removeEventListener("dom-ready", onReady);
	};
}
