/**
 * Permission policy for untrusted web content: a browser pane's guest, the
 * popups it opens, workers, and any subframe of the host window.
 *
 * Electron grants every permission request when no handler is installed on a
 * session — so, without this, a page loaded in the browser pane could turn on
 * the camera or microphone, read geolocation or the clipboard, start screen
 * capture, post OS notifications under the app's name, or launch an external
 * URL-scheme handler (`ssh:`, `tel:`, `x-apple.systempreferences:`) from a
 * subframe, all without any prompt. The app's own document keeps Electron's
 * default (grant); guests only get the permissions listed here.
 *
 * Kept free of Electron imports so the decision is unit-testable; the live
 * wiring is `installGuestPermissionPolicy`, called by the browser manager.
 */

import { isBrowserPanePopup } from "./popup-window";

const GUEST_ALLOWED_PERMISSIONS = new Set<string>([
	// HTML fullscreen (video players); stays inside the pane's webview.
	"fullscreen",
	// navigator.clipboard.writeText — "copy" buttons; write-only.
	"clipboard-sanitized-write",
	// Encrypted Media Extensions; no privacy surface.
	"mediaKeySystem",
]);

export function isGuestPermissionAllowed(permission: string): boolean {
	return GUEST_ALLOWED_PERMISSIONS.has(permission);
}

export interface PermissionSubject {
	/** Null when the request comes from a service or shared worker. */
	contents: Pick<Electron.WebContents, "getType"> | null;
	isMainFrame: boolean;
}

/**
 * Whether the requester is untrusted web content rather than the app's own
 * top-level document: a webview guest, a pane popup, a worker (no
 * webContents), or a subframe of any window (the PDF viewer, an embedded
 * page).
 */
export function isGuestSubject(subject: PermissionSubject): boolean {
	const { contents } = subject;
	if (!contents) return true;
	if (!subject.isMainFrame) return true;
	try {
		if (contents.getType() === "webview") return true;
	} catch {
		// Destroyed webContents: nothing legitimate is asking.
		return true;
	}
	return isBrowserPanePopup(contents as Electron.WebContents);
}

export function shouldGrantPermission(
	subject: PermissionSubject,
	permission: string,
): boolean {
	return !isGuestSubject(subject) || isGuestPermissionAllowed(permission);
}

const installedSessions = new WeakSet<Electron.Session>();

/** Idempotent per session; the pane, its popups, and the host window share one. */
export function installGuestPermissionPolicy(ses: Electron.Session): void {
	if (installedSessions.has(ses)) return;
	installedSessions.add(ses);
	ses.setPermissionRequestHandler((contents, permission, callback, details) => {
		callback(
			shouldGrantPermission(
				{ contents, isMainFrame: details.isMainFrame },
				permission,
			),
		);
	});
	ses.setPermissionCheckHandler((contents, permission, _origin, details) =>
		shouldGrantPermission(
			{ contents, isMainFrame: details.isMainFrame },
			permission,
		),
	);
}
