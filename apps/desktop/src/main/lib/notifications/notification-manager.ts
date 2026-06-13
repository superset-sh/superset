import type {
	AgentLifecycleEvent,
	NotificationIds,
} from "shared/notification-types";
import { isPaneVisible } from "./utils";

const NOTIFICATION_TTL_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * How long to wait after a "Stop" hook before showing the completion
 * notification. Some agents (Cursor Agent, Claude Code Agent Teams) fire their
 * stop hook after *every* model turn and then immediately begin the next turn.
 * If a "Start" arrives within this window we treat the stop as an intermediate
 * turn boundary and suppress the (spammy) notification + sound.
 */
const DEFAULT_STOP_DEBOUNCE_MS = 4000;

export interface NativeNotification {
	show(): void;
	close(): void;
	on(event: "click", handler: () => void): void;
	on(event: "close", handler: () => void): void;
}

export interface NotificationManagerDeps {
	isSupported: () => boolean;
	createNotification: (opts: {
		title: string;
		body: string;
		silent: boolean;
	}) => NativeNotification;
	playSound: () => void;
	onNotificationClick: (ids: NotificationIds) => void;
	getVisibilityContext: () => {
		isFocused: boolean;
		currentWorkspaceId: string | null;
		tabsState:
			| {
					activeTabIds?: Record<string, string | null>;
					focusedPaneIds?: Record<string, string>;
			  }
			| undefined;
	};
	getWorkspaceName: (workspaceId: string | undefined) => string;
	getNotificationTitle: (event: AgentLifecycleEvent) => string;
	/**
	 * Debounce window for "Stop" events. A "Start" for the same pane/session
	 * within this window cancels the pending completion notification.
	 * Defaults to {@link DEFAULT_STOP_DEBOUNCE_MS}.
	 */
	stopDebounceMs?: number;
	/** Schedules a callback. Injectable for tests; defaults to setTimeout. */
	setTimer?: (fn: () => void, ms: number) => unknown;
	/** Cancels a scheduled callback. Injectable for tests; defaults to clearTimeout. */
	clearTimer?: (handle: unknown) => void;
}

interface TrackedEntry {
	notification: NativeNotification;
	createdAt: number;
}

export class NotificationManager {
	private active = new Map<string, TrackedEntry>();
	private pendingStops = new Map<string, unknown>();
	private counter = 0;
	private sweepTimer: ReturnType<typeof setInterval> | null = null;

	constructor(private deps: NotificationManagerDeps) {}

	private get stopDebounceMs(): number {
		return this.deps.stopDebounceMs ?? DEFAULT_STOP_DEBOUNCE_MS;
	}

	private setTimer(fn: () => void, ms: number): unknown {
		return (this.deps.setTimer ?? ((cb, delay) => setTimeout(cb, delay)))(
			fn,
			ms,
		);
	}

	private clearTimer(handle: unknown): void {
		(
			this.deps.clearTimer ??
			((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
		)(handle);
	}

	start(): void {
		if (this.sweepTimer) return;
		this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
	}

	handleAgentLifecycle(event: AgentLifecycleEvent): void {
		// A new turn beginning cancels any pending completion notification for the
		// same pane/session: the agent wasn't actually done, it just paused
		// between turns (Cursor / Claude Agent Teams fire stop after every turn).
		if (event.eventType === "Start") {
			const startKey = this.correlationKey(event);
			if (startKey) this.cancelPendingStop(startKey);
			return;
		}

		if (!this.deps.isSupported()) return;
		if (this.shouldSuppressForVisiblePane(event)) return;

		// Permission requests / pending questions genuinely await user input, and
		// uncorrelated events can't be debounced — show those immediately.
		const correlationKey = this.correlationKey(event);
		if (event.eventType !== "Stop" || !correlationKey) {
			this.showNotification(event, correlationKey ?? `_anon_${this.counter++}`);
			return;
		}

		// Debounce "Stop" so a fast follow-up "Start" can cancel it.
		this.cancelPendingStop(correlationKey);
		const handle = this.setTimer(() => {
			this.pendingStops.delete(correlationKey);
			this.showNotification(event, correlationKey);
		}, this.stopDebounceMs);
		this.pendingStops.set(correlationKey, handle);
	}

	private correlationKey(event: AgentLifecycleEvent): string | null {
		return event.sessionId ?? event.paneId ?? null;
	}

	private cancelPendingStop(key: string): void {
		const handle = this.pendingStops.get(key);
		if (handle === undefined) return;
		this.clearTimer(handle);
		this.pendingStops.delete(key);
	}

	private showNotification(event: AgentLifecycleEvent, key: string): void {
		const workspaceName = this.deps.getWorkspaceName(event.workspaceId);
		const title = this.deps.getNotificationTitle(event);

		const isPermissionRequest = event.eventType === "PermissionRequest";
		const isPendingQuestion = event.eventType === "PendingQuestion";
		const notification = this.deps.createNotification({
			title:
				isPermissionRequest || isPendingQuestion
					? `Awaiting Response — ${workspaceName}`
					: `Agent Complete — ${workspaceName}`,
			body:
				isPermissionRequest || isPendingQuestion
					? `"${title}" is waiting for your reply`
					: `"${title}" has finished its task`,
			silent: true,
		});

		this.track(key, notification);

		this.deps.playSound();

		notification.on("click", () => {
			this.deps.onNotificationClick({
				paneId: event.paneId,
				tabId: event.tabId,
				workspaceId: event.workspaceId,
				sessionId: event.sessionId,
				...(event.terminalId ? { terminalId: event.terminalId } : {}),
			});
			this.untrack(key, notification);
		});

		notification.on("close", () => {
			this.untrack(key, notification);
		});

		notification.show();
	}

	/** Number of tracked notifications (for testing). */
	get activeCount(): number {
		return this.active.size;
	}

	dispose(): void {
		if (this.sweepTimer) {
			clearInterval(this.sweepTimer);
			this.sweepTimer = null;
		}
		for (const handle of this.pendingStops.values()) {
			this.clearTimer(handle);
		}
		this.pendingStops.clear();
		this.active.clear();
	}

	private shouldSuppressForVisiblePane(event: AgentLifecycleEvent): boolean {
		if (!event.workspaceId || !event.tabId || !event.paneId) return false;

		const ctx = this.deps.getVisibilityContext();
		if (!ctx.isFocused) return false;

		return isPaneVisible({
			currentWorkspaceId: ctx.currentWorkspaceId,
			tabsState: ctx.tabsState,
			pane: {
				workspaceId: event.workspaceId,
				tabId: event.tabId,
				paneId: event.paneId,
			},
		});
	}

	private track(key: string, notification: NativeNotification): void {
		const prev = this.active.get(key);
		if (prev) {
			prev.notification.close();
		}
		this.active.set(key, { notification, createdAt: Date.now() });
	}

	private untrack(key: string, notification?: NativeNotification): void {
		const current = this.active.get(key);
		if (!current) return;
		if (notification && current.notification !== notification) return;
		this.active.delete(key);
	}

	private sweep(): void {
		const now = Date.now();
		for (const [key, entry] of this.active) {
			if (now - entry.createdAt > NOTIFICATION_TTL_MS) {
				this.active.delete(key);
			}
		}
	}
}
