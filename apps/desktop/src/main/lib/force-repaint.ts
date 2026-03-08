import type { BrowserWindow } from "electron";

/**
 * Forces a full repaint of the window's compositor layers.
 *
 * `invalidate()` alone may not rebuild corrupted GPU layers — a tiny resize
 * forces Chromium to reconstruct the compositor layer tree. This is more
 * reliable than `invalidate()` alone, especially on macOS where the GPU
 * compositor can lose layers after occlusion, minimization, or GPU process
 * restarts.
 *
 * For maximized/fullscreen windows the resize trick cannot be applied
 * (it would unmaximize/exit-fullscreen), so only `invalidate()` is used.
 */
export function forceRepaint(win: BrowserWindow): void {
	if (win.isDestroyed()) return;
	win.webContents.invalidate();
	if (win.isMaximized() || win.isFullScreen()) return;
	const [width, height] = win.getSize();
	win.setSize(width + 1, height);
	setTimeout(() => {
		if (!win.isDestroyed()) win.setSize(width, height);
	}, 32);
}
