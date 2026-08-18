import { spawn } from "node:child_process";
import {
	CODEX_CLIENT_NAME,
	type CodexInitializeResponse,
	type CodexRequestId,
	type CodexRpcErrorPayload,
	incomingFrameSchema,
	initializeResponseSchema,
} from "../wire";

export type CodexTransport = {
	send(line: string): void;
	close(): Promise<void>;
};

export type CodexTransportHandlers = {
	onLine(line: string): void;
	onStderr(chunk: string): void;
	onExit(code: number | null, signal: string | null): void;
};

export type SpawnCodexOptions = {
	command?: string;
	args?: string[];
	cwd?: string;
	env?: NodeJS.ProcessEnv;
};

export function spawnCodexTransport(
	options: SpawnCodexOptions,
	handlers: CodexTransportHandlers,
): CodexTransport {
	const child = spawn(
		options.command ?? "codex",
		options.args ?? ["app-server", "--stdio"],
		{
			cwd: options.cwd,
			env: options.env ?? process.env,
			stdio: ["pipe", "pipe", "pipe"],
		},
	);

	let pending = "";
	child.stdout.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => {
		pending += chunk;
		let newline = pending.indexOf("\n");
		while (newline !== -1) {
			const line = pending.slice(0, newline);
			pending = pending.slice(newline + 1);
			if (line.trim().length > 0) handlers.onLine(line);
			newline = pending.indexOf("\n");
		}
	});
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk: string) => handlers.onStderr(chunk));
	child.on("exit", (code, signal) => handlers.onExit(code, signal));

	let exited = false;
	child.on("close", () => {
		exited = true;
	});

	return {
		send: (line) => {
			if (!exited) child.stdin.write(`${line}\n`);
		},
		close: async () => {
			if (exited) return;
			child.stdin.end();
			await new Promise<void>((resolve) => {
				const timer = setTimeout(() => {
					child.kill("SIGKILL");
					resolve();
				}, 2000);
				child.once("close", () => {
					clearTimeout(timer);
					resolve();
				});
			});
		},
	};
}

export type CodexServerRequest = {
	id: CodexRequestId;
	method: string;
	params: unknown;
};

export type CodexNotification = { method: string; params: unknown };

export type CodexRpcClientOptions = {
	createTransport(handlers: CodexTransportHandlers): CodexTransport;
	onNotification(notification: CodexNotification): void;
	onServerRequest(request: CodexServerRequest): void;
	onDispatchError?(error: unknown, method: string): void;
	onFrame?(direction: "in" | "out", frame: unknown): void;
	onStderr?(chunk: string): void;
	onExit?(code: number | null, signal: string | null): void;
	clientVersion?: string;
};

export class CodexRpcError extends Error {
	constructor(
		readonly method: string,
		readonly rpcError: CodexRpcErrorPayload,
	) {
		super(`${method}: ${rpcError.message}`);
		this.name = "CodexRpcError";
	}
}

type PendingRequest = {
	method: string;
	resolve(result: unknown): void;
	reject(error: Error): void;
};

export class CodexRpcClient {
	private readonly transport: CodexTransport;
	private readonly pending = new Map<CodexRequestId, PendingRequest>();
	private nextId = 1;
	private closed = false;

	constructor(private readonly options: CodexRpcClientOptions) {
		this.transport = options.createTransport({
			onLine: (line) => this.receive(line),
			onStderr: (chunk) => options.onStderr?.(chunk),
			onExit: (code, signal) => this.handleExit(code, signal),
		});
	}

	async initialize(): Promise<CodexInitializeResponse> {
		const result = await this.request("initialize", {
			clientInfo: {
				name: CODEX_CLIENT_NAME,
				title: null,
				version: this.options.clientVersion ?? "0.0.0",
			},
			capabilities: { experimentalApi: true, requestAttestation: false },
		});
		this.notify("initialized");
		return initializeResponseSchema.parse(result);
	}

	request(method: string, params?: unknown): Promise<unknown> {
		if (this.closed) {
			return Promise.reject(new Error(`${method}: codex app-server closed`));
		}
		const id = this.nextId++;
		const frame = { jsonrpc: "2.0", id, method, params: params ?? {} };
		return new Promise((resolve, reject) => {
			this.pending.set(id, { method, resolve, reject });
			this.write(frame);
		});
	}

	notify(method: string, params?: unknown): void {
		if (this.closed) return;
		this.write({ jsonrpc: "2.0", method, ...(params ? { params } : {}) });
	}

	respond(id: CodexRequestId, result: unknown): void {
		this.write({ jsonrpc: "2.0", id, result });
	}

	respondWithError(id: CodexRequestId, message: string): void {
		this.write({ jsonrpc: "2.0", id, error: { code: -32601, message } });
	}

	async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		await this.transport.close();
		this.rejectPending("codex app-server closed");
	}

	private write(frame: unknown): void {
		this.options.onFrame?.("out", frame);
		this.transport.send(JSON.stringify(frame));
	}

	private receive(line: string): void {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			this.options.onStderr?.(`unparseable frame: ${line}\n`);
			return;
		}
		this.options.onFrame?.("in", parsed);

		const frame = incomingFrameSchema.safeParse(parsed);
		if (!frame.success) {
			this.options.onStderr?.(`unrecognized frame: ${line}\n`);
			return;
		}
		const { id, method, params, result, error } = frame.data;

		if (method !== undefined) {
			try {
				if (id === undefined) this.options.onNotification({ method, params });
				else this.options.onServerRequest({ id, method, params });
			} catch (error) {
				if (id !== undefined) {
					this.respondWithError(id, `unhandled by superset chat runtime`);
				}
				this.options.onDispatchError?.(error, method);
			}
			return;
		}
		if (id === undefined) return;

		const request = this.pending.get(id);
		if (!request) return;
		this.pending.delete(id);
		if (error !== undefined) {
			request.reject(new CodexRpcError(request.method, error));
			return;
		}
		request.resolve(result);
	}

	private handleExit(code: number | null, signal: string | null): void {
		this.closed = true;
		this.rejectPending(
			`codex app-server exited (code ${code ?? "null"}, signal ${signal ?? "null"})`,
		);
		this.options.onExit?.(code, signal);
	}

	private rejectPending(message: string): void {
		for (const [id, request] of [...this.pending]) {
			this.pending.delete(id);
			request.reject(new Error(`${request.method}: ${message}`));
		}
	}
}
