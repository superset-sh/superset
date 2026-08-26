import { BrowserWindow, type IpcMainInvokeEvent } from "electron";

/**
 * Per-call tRPC context for Electron IPC.
 *
 * `senderWindow` is the BrowserWindow that made the call, resolved from the IPC
 * event's sender WebContents. This is what lets window-scoped procedures (e.g.
 * the per-window active organization) act on the exact window that called them
 * rather than on a single global "current" window.
 *
 * Returns null when the sender is not a top-level window (e.g. a <webview>
 * guest); window-scoped procedures treat that as "no window".
 */
export interface TrpcContext {
	senderWindow: BrowserWindow | null;
}

export async function createTrpcContext({
	event,
}: {
	event: IpcMainInvokeEvent;
}): Promise<TrpcContext> {
	// Only treat the sender as a window when it is that window's own top-level
	// WebContents. `BrowserWindow.fromWebContents` returns the *host* window for a
	// `<webview>` guest, so without this check an embedded webview could inherit
	// the host window's organization on window-scoped procedures.
	const window = BrowserWindow.fromWebContents(event.sender);
	return {
		senderWindow: window?.webContents === event.sender ? window : null,
	};
}
