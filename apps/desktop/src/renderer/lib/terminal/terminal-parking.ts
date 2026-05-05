// Body-level hidden container that owns wrapper divs of terminals whose
// React component is currently unmounted (e.g. workspace switch, tab hide).
// Keeps xterm attached to the document so it survives provider remounts
// without a detach/reattach flash — VSCode's setVisible(false) model. Looked
// up by DOM id so it's HMR-safe (a module-level `let` would leak on re-eval).
// `inert` removes the whole subtree from the tab order and the accessibility
// tree, and also moves focus out of it — so a parked terminal's internal
// <textarea> can't receive keystrokes meant for the active pane.
//
// Shared by v1 (v1-terminal-cache.ts) and v2 (terminal-runtime.ts) so the
// two surfaces converge on a single DOM node and lifecycle.
const PARKING_CONTAINER_ID = "terminal-parking";

export function getTerminalParkingContainer(): HTMLDivElement {
	const existing = document.getElementById(PARKING_CONTAINER_ID);
	if (existing) return existing as HTMLDivElement;

	const el = document.createElement("div");
	el.id = PARKING_CONTAINER_ID;
	el.setAttribute("inert", "");
	el.setAttribute("aria-hidden", "true");
	el.style.position = "fixed";
	el.style.left = "-9999px";
	el.style.top = "-9999px";
	el.style.width = "100vw";
	el.style.height = "100vh";
	el.style.overflow = "hidden";
	el.style.pointerEvents = "none";
	document.body.appendChild(el);
	return el;
}
