import { useEffect, useRef } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import {
	getOrCreateWebview,
	setOverlayContainer,
	syncAllPositions,
} from "renderer/stores/webview-overlay";

/**
 * Persistent overlay container for all browser webviews.
 *
 * Mounted at the dashboard layout level so it survives workspace/tab route
 * changes. Webview DOM elements are never reparented — only shown/hidden and
 * repositioned — which prevents Electron from reloading them.
 */
export function WebviewOverlay() {
	const overlayRef = useRef<HTMLDivElement>(null);

	// Register the overlay container with the module-level manager
	useEffect(() => {
		setOverlayContainer(overlayRef.current);
		return () => setOverlayContainer(null);
	}, []);

	// Create webviews as panes appear in the store.
	// Destruction is handled by useBrowserLifecycle.
	useEffect(() => {
		// Initialize from current state
		const state = useTabsStore.getState();
		for (const [id, pane] of Object.entries(state.panes)) {
			if (pane.type === "webview") {
				getOrCreateWebview(id, pane.browser?.currentUrl ?? "about:blank");
			}
		}

		return useTabsStore.subscribe((state) => {
			for (const [id, pane] of Object.entries(state.panes)) {
				if (pane.type === "webview") {
					getOrCreateWebview(id, pane.browser?.currentUrl ?? "about:blank");
				}
			}
		});
	}, []);

	// Sync webview positions to slot rects on resize / layout changes
	useEffect(() => {
		let rafId: number | null = null;

		const scheduleSync = () => {
			if (rafId !== null) return;
			rafId = requestAnimationFrame(() => {
				syncAllPositions();
				rafId = null;
			});
		};

		// Observe the parent for size changes (sidebar toggle, window resize, etc.)
		const resizeObserver = new ResizeObserver(scheduleSync);
		if (overlayRef.current?.parentElement) {
			resizeObserver.observe(overlayRef.current.parentElement);
		}

		window.addEventListener("resize", scheduleSync);

		// Periodic fallback for edge cases (pane splits, drag-resize, etc.)
		const intervalId = setInterval(scheduleSync, 150);

		return () => {
			if (rafId !== null) cancelAnimationFrame(rafId);
			resizeObserver.disconnect();
			window.removeEventListener("resize", scheduleSync);
			clearInterval(intervalId);
		};
	}, []);

	return (
		<div
			ref={overlayRef}
			style={{
				position: "fixed",
				inset: 0,
				pointerEvents: "none",
				zIndex: 50,
			}}
		/>
	);
}
