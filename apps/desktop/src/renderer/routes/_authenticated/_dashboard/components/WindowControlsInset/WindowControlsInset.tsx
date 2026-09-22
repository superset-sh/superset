/**
 * Keeps a top strip clear of the window-controls overlay that Electron draws
 * on Windows and Linux. The overlay's width comes from the titlebar-area
 * environment variables, so this is zero where there is no overlay.
 */
export function WindowControlsInset() {
	return (
		<div
			className="drag h-full shrink-0"
			style={{ width: "calc(100vw - env(titlebar-area-width, 100vw))" }}
		/>
	);
}
