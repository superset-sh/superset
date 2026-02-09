import type {
	AgentLifecycleEvent,
	NotificationIds,
} from "shared/notification-types";
import { isPaneVisible } from "./utils";

const NOTIFICATION_TTL_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

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
}

interface TrackedEntry {
	notification: NativeNotification;
	createdAt: number;
}

export class NotificationManager {
	private active = new Map<string, TrackedEntry>();
	private counter = 0;
	private sweepTimer: ReturnType<typeof setInterval> | null = null;

	constructor(private deps: NotificationManagerDeps) {}

	start(): void {
		if (this.sweepTimer) return;
		this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
	}

	handleAgentLifecycle(event: AgentLifecycleEvent): void {
		if (event.eventType === "Start") return;
		if (!this.deps.isSupported()) return;

		if (this.shouldSuppressForVisiblePane(event)) return;

		const workspaceName = this.deps.getWorkspaceName(event.workspaceId);
		const title = this.deps.getNotificationTitle(event);

		const isPermissionRequest = event.eventType === "PermissionRequest";
		const notification = this.deps.createNotification({
			title: isPermissionRequest
				? `Input Needed — ${workspaceName}`
				: `Agent Complete — ${workspaceName}`,
			body: isPermissionRequest
				? `"${title}" needs your attention`
				: `"${title}" has finished its task`,
			silent: true,
		});

		const key = event.paneId ?? `_anon_${this.counter++}`;
		this.track(key, notification);

		this.deps.playSound();

		notification.on("click", () => {
			this.deps.onNotificationClick({
				paneId: event.paneId,
				tabId: event.tabId,
				workspaceId: event.workspaceId,
			});
			this.untrack(key);
		});

		notification.on("close", () => {
			this.untrack(key);
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

	private untrack(key: string): void {
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
