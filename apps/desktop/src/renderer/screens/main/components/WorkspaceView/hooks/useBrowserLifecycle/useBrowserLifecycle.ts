import { useEffect, useRef } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { destroyWebview } from "renderer/stores/webview-overlay";

export function useBrowserLifecycle() {
	const previousPaneIdsRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		// Initialize with current browser pane IDs
		const state = useTabsStore.getState();
		previousPaneIdsRef.current = new Set(
			Object.entries(state.panes)
				.filter(([, p]) => p.type === "webview")
				.map(([id]) => id),
		);

		return useTabsStore.subscribe((state) => {
			const currentBrowserPaneIds = new Set(
				Object.entries(state.panes)
					.filter(([, p]) => p.type === "webview")
					.map(([id]) => id),
			);
			for (const prevId of previousPaneIdsRef.current) {
				if (!currentBrowserPaneIds.has(prevId)) {
					destroyWebview(prevId);
				}
			}
			previousPaneIdsRef.current = currentBrowserPaneIds;
		});
	}, []);
}
