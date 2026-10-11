import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import type {
	PaneLayoutErrorCode,
	PaneLayoutOp,
	PaneLayoutOpResult,
} from "@superset/shared/pane-layout-ops";
import { getFocusedOrLastWindow } from "../window-registry/window-registry";

const REPLY_TIMEOUT_MS = 10_000;

const STATUS_BY_CODE: Record<PaneLayoutErrorCode, number> = {
	NOT_FOUND: 404,
	BAD_REQUEST: 400,
	PRECONDITION_FAILED: 412,
};

export interface PaneLayoutRendererRequest {
	requestId: string;
	workspaceId: string;
	op: PaneLayoutOp;
	targetWebContentsId: number;
}

export interface PaneLayoutReply {
	requestId: string;
	result?: PaneLayoutOpResult;
	error?: { code?: PaneLayoutErrorCode; message: string };
}

export class PaneLayoutRequestError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

interface PendingRequest {
	targetWebContentsId: number;
	resolve: (result: PaneLayoutOpResult) => void;
	reject: (error: PaneLayoutRequestError) => void;
	timer: ReturnType<typeof setTimeout>;
}

/**
 * Hands pane layout ops from the bridge to one renderer window and waits for
 * its reply. Exactly one window gets each op, so a mutation is never applied
 * twice.
 */
class PaneLayoutRequests extends EventEmitter {
	private readonly subscribers = new Map<number, number>();
	private readonly pending = new Map<string, PendingRequest>();

	addSubscriber(webContentsId: number): void {
		this.subscribers.set(
			webContentsId,
			(this.subscribers.get(webContentsId) ?? 0) + 1,
		);
	}

	removeSubscriber(webContentsId: number): void {
		const count = (this.subscribers.get(webContentsId) ?? 1) - 1;
		if (count > 0) this.subscribers.set(webContentsId, count);
		else this.subscribers.delete(webContentsId);
	}

	private pickTarget(): number | null {
		const focused = getFocusedOrLastWindow();
		const focusedId =
			focused && !focused.isDestroyed() ? focused.webContents.id : null;
		if (focusedId !== null && this.subscribers.has(focusedId)) return focusedId;
		return this.subscribers.keys().next().value ?? null;
	}

	request(workspaceId: string, op: PaneLayoutOp): Promise<PaneLayoutOpResult> {
		const targetWebContentsId = this.pickTarget();
		if (targetWebContentsId === null) {
			return Promise.reject(
				new PaneLayoutRequestError(
					503,
					"No signed-in desktop window is open to apply the layout change.",
				),
			);
		}
		const requestId = randomUUID();
		return new Promise<PaneLayoutOpResult>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(requestId);
				reject(
					new PaneLayoutRequestError(
						504,
						"The desktop app did not apply the layout change in time.",
					),
				);
			}, REPLY_TIMEOUT_MS);
			this.pending.set(requestId, {
				targetWebContentsId,
				resolve,
				reject,
				timer,
			});
			this.emit("request", {
				requestId,
				workspaceId,
				op,
				targetWebContentsId,
			} satisfies PaneLayoutRendererRequest);
		});
	}

	respond(reply: PaneLayoutReply, senderWebContentsId: number | null): void {
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
			new PaneLayoutRequestError(
				code ? STATUS_BY_CODE[code] : 500,
				reply.error?.message ?? "The layout change failed.",
			),
		);
	}
}

export const paneLayoutRequests = new PaneLayoutRequests();
