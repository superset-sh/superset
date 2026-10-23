import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
	SidebarFolderPruneRequest,
	SidebarFolderPruneResult,
	SidebarRequestErrorCode,
} from "@superset/shared/sidebar-folders";
import {
	getFocusedOrLastWindow,
	getOrg,
} from "../window-registry/window-registry";

const REPLY_TIMEOUT_MS = 30_000;

const STATUS_BY_CODE: Record<SidebarRequestErrorCode, number> = {
	BAD_REQUEST: 400,
	PRECONDITION_FAILED: 412,
};

export interface SidebarRendererRequest {
	requestId: string;
	request: SidebarFolderPruneRequest;
	targetWebContentsId: number;
}

export interface SidebarReply {
	requestId: string;
	result?: SidebarFolderPruneResult;
	error?: { code?: SidebarRequestErrorCode; message: string };
}

export class SidebarRequestError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

interface SidebarRequestsDeps {
	orgOfWindow: (windowId: number) => string | null;
	focusedWindowId: () => number | null;
	replyTimeoutMs: number;
}

interface Subscriber {
	windowId: number;
	count: number;
}

interface PendingRequest {
	targetWebContentsId: number;
	resolve: (result: SidebarFolderPruneResult) => void;
	reject: (error: SidebarRequestError) => void;
	timer: ReturnType<typeof setTimeout>;
}

/**
 * Hands sidebar requests from the bridge to one renderer window and waits
 * for its reply. Sidebar state belongs to the organization a window shows,
 * so only a window of the request's organization is ever picked.
 */
export class SidebarRequests extends EventEmitter {
	private readonly subscribers = new Map<number, Subscriber>();
	private readonly pending = new Map<string, PendingRequest>();

	constructor(private readonly deps: SidebarRequestsDeps) {
		super();
	}

	addSubscriber(webContentsId: number, windowId: number): void {
		const existing = this.subscribers.get(webContentsId);
		this.subscribers.set(webContentsId, {
			windowId,
			count: (existing?.count ?? 0) + 1,
		});
	}

	removeSubscriber(webContentsId: number): void {
		const existing = this.subscribers.get(webContentsId);
		if (!existing) return;
		if (existing.count > 1) {
			this.subscribers.set(webContentsId, {
				...existing,
				count: existing.count - 1,
			});
		} else {
			this.subscribers.delete(webContentsId);
		}
	}

	/** The focused window when it shows the organization, else any window that does. */
	private pickTarget(organizationId: string): number | null {
		const matching = [...this.subscribers].filter(
			([, subscriber]) =>
				this.deps.orgOfWindow(subscriber.windowId) === organizationId,
		);
		const focusedWindowId = this.deps.focusedWindowId();
		const focused = matching.find(
			([, subscriber]) => subscriber.windowId === focusedWindowId,
		);
		return (focused ?? matching[0])?.[0] ?? null;
	}

	pruneEmptyFolders(
		request: SidebarFolderPruneRequest,
	): Promise<SidebarFolderPruneResult> {
		const targetWebContentsId = this.pickTarget(request.organizationId);
		if (targetWebContentsId === null) {
			return Promise.reject(
				new SidebarRequestError(
					412,
					"No desktop window is open on this organization. Open one, then try again.",
				),
			);
		}
		const requestId = randomUUID();
		return new Promise<SidebarFolderPruneResult>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(requestId);
				reject(
					new SidebarRequestError(
						504,
						"The desktop app did not answer in time. Check the sidebar before you try again.",
					),
				);
			}, this.deps.replyTimeoutMs);
			this.pending.set(requestId, {
				targetWebContentsId,
				resolve,
				reject,
				timer,
			});
			this.emit("request", {
				requestId,
				request,
				targetWebContentsId,
			} satisfies SidebarRendererRequest);
		});
	}

	respond(reply: SidebarReply, senderWebContentsId: number | null): void {
		const pending = this.pending.get(reply.requestId);
		if (!pending || pending.targetWebContentsId !== senderWebContentsId) return;
		this.pending.delete(reply.requestId);
		clearTimeout(pending.timer);
		if (reply.result) {
			pending.resolve(reply.result);
			return;
		}
		const code = reply.error?.code;
		pending.reject(
			new SidebarRequestError(
				code ? STATUS_BY_CODE[code] : 500,
				reply.error?.message ?? "The sidebar change failed.",
			),
		);
	}
}

export const sidebarRequests = new SidebarRequests({
	orgOfWindow: getOrg,
	focusedWindowId: () => {
		const window = getFocusedOrLastWindow();
		return window && !window.isDestroyed() ? window.id : null;
	},
	replyTimeoutMs: REPLY_TIMEOUT_MS,
});
