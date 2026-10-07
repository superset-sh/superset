import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";

export type FilePaneOpenTarget = "current-tab" | "new-tab";

export interface FilePaneOpenRequest {
	requestId: string;
	/** The BrowserWindow that should handle it; every other window ignores it. */
	targetWindowId: number;
	workspaceId: string;
	projectId: string | null;
	paths: string[];
	line?: number;
	target: FilePaneOpenTarget;
}

export type FilePaneOpenOutcome =
	| { ok: true; paneIds: string[] }
	| { ok: false; error: string };

export class FilePaneOpenTimeoutError extends Error {
	constructor() {
		super(
			"No workspace view picked up the file-open request. Is the desktop app running and signed in?",
		);
		this.name = "FilePaneOpenTimeoutError";
	}
}

export class FilePaneOpenRejectedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "FilePaneOpenRejectedError";
	}
}

export class FilePaneOpenAbortedError extends Error {
	constructor() {
		super("The caller stopped waiting for the file-open request.");
		this.name = "FilePaneOpenAbortedError";
	}
}

interface PendingRequest {
	settle: (outcome: FilePaneOpenOutcome) => void;
	timer: ReturnType<typeof setTimeout>;
}

/**
 * File panes exist only in the renderer, so the main process cannot open one
 * itself. A request is broadcast over `open-request` and handled by the
 * window it names; that window's workspace view reports the pane ids back
 * through `resolve`, which settles the promise the bridge is waiting on.
 */
export class FilePaneOpenRequests extends EventEmitter {
	private readonly pending = new Map<string, PendingRequest>();

	request(
		input: Omit<FilePaneOpenRequest, "requestId">,
		options: { timeoutMs: number; signal?: AbortSignal },
	): Promise<string[]> {
		const requestId = randomBytes(8).toString("hex");
		const request: FilePaneOpenRequest = { ...input, requestId };
		return new Promise<string[]>((resolve, reject) => {
			const finish = (fn: () => void) => {
				const entry = this.pending.get(requestId);
				if (!entry) return;
				clearTimeout(entry.timer);
				this.pending.delete(requestId);
				options.signal?.removeEventListener("abort", onAbort);
				fn();
			};
			const settle = (outcome: FilePaneOpenOutcome) =>
				finish(() => {
					if (outcome.ok) resolve(outcome.paneIds);
					else reject(new FilePaneOpenRejectedError(outcome.error));
				});
			const onAbort = () =>
				finish(() => reject(new FilePaneOpenAbortedError()));
			const timer = setTimeout(
				() => finish(() => reject(new FilePaneOpenTimeoutError())),
				options.timeoutMs,
			);
			this.pending.set(requestId, { settle, timer });
			if (options.signal?.aborted) {
				onAbort();
				return;
			}
			options.signal?.addEventListener("abort", onAbort, { once: true });
			try {
				this.emit("open-request", request);
			} catch (err) {
				finish(() => reject(err));
			}
		});
	}

	/** Returns false when the request already settled or never existed. */
	resolve(requestId: string, outcome: FilePaneOpenOutcome): boolean {
		const entry = this.pending.get(requestId);
		if (!entry) return false;
		entry.settle(outcome);
		return true;
	}

	pendingCount(): number {
		return this.pending.size;
	}
}

export const filePaneOpenRequests = new FilePaneOpenRequests();
