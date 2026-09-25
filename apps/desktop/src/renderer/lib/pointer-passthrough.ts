/**
 * Embedded documents — a page pane's iframe, a hoisted browser webview —
 * hit-test ahead of the host, so a host gesture that crosses one stalls at
 * its edge: a pane drag never reaches the drop target underneath, a Radix
 * popover never sees the click that should dismiss it. While such a gesture
 * is in flight the host is marked `data-pointer-passthrough` and embeds let
 * the pointer fall through — `globals.css` covers iframes, and the browser
 * registry mirrors the state onto its webviews, which live outside the pane
 * tree where a stylesheet rule can't reach them.
 *
 * Sources are ref-counted by name so one gesture ending can't clear another
 * still in flight (two panes' popovers, a drag during a resize).
 */
export const POINTER_PASSTHROUGH_ATTRIBUTE = "data-pointer-passthrough";

export const NATIVE_DRAG_SOURCE = "native-drag";

class PointerPassthrough {
	private sources = new Set<string>();
	private listeners = new Set<(active: boolean) => void>();
	private nativeDragListenersInstalled = false;

	get active(): boolean {
		return this.sources.size > 0;
	}

	set(source: string, active: boolean): void {
		const wasActive = this.active;
		if (active) this.sources.add(source);
		else this.sources.delete(source);
		if (this.active === wasActive) return;
		document.documentElement.toggleAttribute(
			POINTER_PASSTHROUGH_ATTRIBUTE,
			this.active,
		);
		for (const listener of this.listeners) listener(this.active);
	}

	subscribe(listener: (active: boolean) => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * A native drag (a pane or tab header, a sidebar row) is the one gesture
	 * every embed must yield to; the others are opted into by their owners.
	 * `drop` ends a drag that landed, `dragend` one that didn't, and a window
	 * blur one the OS cancelled without either.
	 */
	installNativeDragListeners(target: Window): void {
		if (this.nativeDragListenersInstalled) return;
		this.nativeDragListenersInstalled = true;
		const start = () => this.set(NATIVE_DRAG_SOURCE, true);
		const end = () => this.set(NATIVE_DRAG_SOURCE, false);
		target.addEventListener("dragstart", start, true);
		target.addEventListener("dragend", end, true);
		target.addEventListener("drop", end, true);
		target.addEventListener("blur", end);
	}
}

export const pointerPassthrough: PointerPassthrough =
	(import.meta.hot?.data?.pointerPassthrough as
		| PointerPassthrough
		| undefined) ?? new PointerPassthrough();

if (import.meta.hot) {
	import.meta.hot.data.pointerPassthrough = pointerPassthrough;
}

if (typeof window !== "undefined") {
	pointerPassthrough.installNativeDragListeners(window);
}
