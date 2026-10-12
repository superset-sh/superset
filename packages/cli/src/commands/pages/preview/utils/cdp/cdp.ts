type Listener = (params: Record<string, unknown>, sessionId?: string) => void;

interface Pending {
	resolve: (value: Record<string, unknown>) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
	method: string;
}

export class CdpConnection {
	private nextId = 1;
	private pending = new Map<number, Pending>();
	private listeners = new Map<string, Set<Listener>>();

	private constructor(
		private socket: WebSocket,
		private commandTimeoutMs: number,
	) {
		socket.addEventListener("message", (event) =>
			this.receive(String(event.data)),
		);
		socket.addEventListener("close", () => this.failAll("the browser closed"));
	}

	static connect(
		url: string,
		commandTimeoutMs: number,
	): Promise<CdpConnection> {
		return new Promise((resolve, reject) => {
			const socket = new WebSocket(url);
			socket.addEventListener("open", () =>
				resolve(new CdpConnection(socket, commandTimeoutMs)),
			);
			socket.addEventListener("error", () =>
				reject(new Error(`could not connect to the browser at ${url}`)),
			);
		});
	}

	send(
		method: string,
		params: Record<string, unknown> = {},
		sessionId?: string,
	): Promise<Record<string, unknown>> {
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(
					new Error(
						`${method} timed out after ${this.commandTimeoutMs / 1000}s`,
					),
				);
			}, this.commandTimeoutMs);
			this.pending.set(id, { resolve, reject, timer, method });
			this.socket.send(JSON.stringify({ id, method, params, sessionId }));
		});
	}

	on(method: string, listener: Listener): () => void {
		const set = this.listeners.get(method) ?? new Set();
		set.add(listener);
		this.listeners.set(method, set);
		return () => set.delete(listener);
	}

	waitFor(
		method: string,
		sessionId: string,
		timeoutMs = this.commandTimeoutMs,
	): Promise<Record<string, unknown>> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				off();
				reject(
					new Error(`${method} did not arrive within ${timeoutMs / 1000}s`),
				);
			}, timeoutMs);
			const off = this.on(method, (params, from) => {
				if (from !== sessionId) return;
				clearTimeout(timer);
				off();
				resolve(params);
			});
		});
	}

	close(): void {
		this.socket.close();
	}

	private receive(raw: string): void {
		const message = JSON.parse(raw) as {
			id?: number;
			method?: string;
			params?: Record<string, unknown>;
			result?: Record<string, unknown>;
			error?: { message: string };
			sessionId?: string;
		};
		if (message.id !== undefined) {
			const pending = this.pending.get(message.id);
			if (!pending) return;
			this.pending.delete(message.id);
			clearTimeout(pending.timer);
			if (message.error) {
				pending.reject(
					new Error(`${pending.method}: ${message.error.message}`),
				);
			} else {
				pending.resolve(message.result ?? {});
			}
			return;
		}
		if (!message.method) return;
		for (const listener of this.listeners.get(message.method) ?? []) {
			listener(message.params ?? {}, message.sessionId);
		}
	}

	private failAll(reason: string): void {
		for (const [id, pending] of this.pending) {
			clearTimeout(pending.timer);
			pending.reject(new Error(`${pending.method}: ${reason}`));
			this.pending.delete(id);
		}
	}
}
