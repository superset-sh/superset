import type { AgentLifecycleEvent } from "shared/notification-types";

export interface DockBadgeDeps {
	/** Set the dock badge text (macOS: app.dock.setBadge, others: no-op). */
	setBadge: (text: string) => void;
	/** Bounce the dock icon once (macOS: app.dock.bounce('informational'), others: no-op). */
	bounce: () => void;
	/** Whether the main window is currently focused. */
	isFocused: () => boolean;
}

/**
 * Manages the macOS dock badge count and bounce for workspaces awaiting input.
 *
 * Tracks panes in "permission" (waiting-for-input) state and updates the dock
 * badge accordingly. Bounces the dock icon once per new permission request when
 * the app is not focused.
 */
export class DockBadgeManager {
	/** Pane IDs currently in "permission" state. */
	private pending = new Set<string>();

	constructor(private deps: DockBadgeDeps) {}

	handleAgentLifecycle(event: AgentLifecycleEvent): void {
		const key = event.paneId ?? event.sessionId;
		if (!key) return;

		if (event.eventType === "PermissionRequest") {
			const isNew = !this.pending.has(key);
			this.pending.add(key);
			this.updateBadge();

			if (isNew && !this.deps.isFocused()) {
				this.deps.bounce();
			}
		} else {
			// Start or Stop — pane is no longer waiting for input
			if (this.pending.delete(key)) {
				this.updateBadge();
			}
		}
	}

	/** Clear all tracked state and remove the badge (e.g. on window focus). */
	clearAll(): void {
		if (this.pending.size === 0) return;
		this.pending.clear();
		this.deps.setBadge("");
	}

	/** Number of panes currently awaiting input. */
	get count(): number {
		return this.pending.size;
	}

	private updateBadge(): void {
		const size = this.pending.size;
		this.deps.setBadge(size > 0 ? size.toString() : "");
	}
}
