import type { UnreadableReason } from "../../types";
import type { SheetRequestBody, SheetResponse, SheetResults } from "./protocol";

export class SheetWorkerError extends Error {
	constructor(
		message: string,
		readonly reason: UnreadableReason | null = null,
	) {
		super(message);
	}
}

interface Pending {
	type: SheetRequestBody["type"];
	resolve: (value: never) => void;
	reject: (error: Error) => void;
}

interface WorkerLike {
	postMessage(message: unknown): void;
	terminate(): void;
	onmessage: ((event: MessageEvent<SheetResponse>) => void) | null;
	onerror: ((event: ErrorEvent) => void) | null;
}

export class SheetWorkerClient {
	private nextId = 1;
	private pending = new Map<number, Pending>();
	private failure: Error | null = null;
	private disposed = false;

	constructor(private readonly worker: WorkerLike) {
		worker.onmessage = (event) => {
			const response = event.data;
			const pending = this.pending.get(response.id);
			if (!pending) return;
			this.pending.delete(response.id);
			if (response.ok && response.type === pending.type) {
				pending.resolve(response.result as never);
			} else if (response.ok) {
				pending.reject(
					new SheetWorkerError(
						`Expected a ${pending.type} result, got ${response.type}`,
					),
				);
			} else {
				pending.reject(
					new SheetWorkerError(
						response.reason ?? "unreadable",
						response.reason,
					),
				);
			}
		};
		worker.onerror = (event) => {
			event.preventDefault?.();
			this.fail(new SheetWorkerError(event.message));
		};
	}

	request<T extends SheetRequestBody["type"]>(
		body: Extract<SheetRequestBody, { type: T }>,
	): Promise<SheetResults[T]> {
		if (this.failure) return Promise.reject(this.failure);
		const id = this.nextId++;
		return new Promise<SheetResults[T]>((resolve, reject) => {
			this.pending.set(id, { type: body.type, resolve, reject } as Pending);
			this.worker.postMessage({ ...body, id });
		});
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.worker.terminate();
		this.fail(new Error("Disposed"));
	}

	private fail(error: Error): void {
		this.failure = error;
		for (const pending of this.pending.values()) pending.reject(error);
		this.pending.clear();
	}
}
