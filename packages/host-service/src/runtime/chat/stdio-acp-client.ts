import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import type {
	AcpPermissionRequest,
	AcpPromptBlock,
	AcpSessionNotification,
} from "./acp-protocol";

interface JsonRpcRequest {
	jsonrpc: "2.0";
	id: number | string;
	method: string;
	params?: unknown;
}

interface JsonRpcNotification {
	jsonrpc: "2.0";
	method: string;
	params?: unknown;
}

interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: number | string;
	result?: unknown;
	error?: {
		code: number;
		message: string;
		data?: unknown;
	};
}

type PendingRequest = {
	method: string;
	resolve: (value: unknown) => void;
	reject: (reason: unknown) => void;
	timeout: ReturnType<typeof setTimeout>;
};

export interface AcpAgentClientOptions {
	command: string;
	args: string[];
	cwd: string;
	env?: NodeJS.ProcessEnv;
	onUpdate: (notification: AcpSessionNotification) => void;
	onPermissionRequest: (request: AcpPermissionRequest) => Promise<unknown>;
	onError: (error: Error) => void;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

export class AcpJsonRpcError extends Error {
	readonly code: number;
	readonly data: unknown;

	constructor(error: { code: number; message: string; data?: unknown }) {
		super(error.message);
		this.name = "AcpJsonRpcError";
		this.code = error.code;
		this.data = error.data;
	}
}

export class StdioAcpAgentClient {
	private child: ChildProcessWithoutNullStreams | null = null;
	private exited = false;
	private disposing = false;
	private lines: Interface | null = null;
	private nextRequestId = 1;
	private readonly pending = new Map<number | string, PendingRequest>();
	private readonly stderrLines: string[] = [];

	constructor(private readonly options: AcpAgentClientOptions) {}

	async initialize(): Promise<void> {
		this.startProcess();
		await this.request("initialize", {
			protocolVersion: 1,
			clientCapabilities: {
				auth: { terminal: false },
			},
			clientInfo: {
				name: "superset",
				title: "Superset",
			},
		});
	}

	async newSession(cwd: string): Promise<{ sessionId: string }> {
		const result = await this.request("session/new", {
			cwd,
			mcpServers: [],
		});
		if (!isRecord(result) || typeof result.sessionId !== "string") {
			throw new Error("ACP session/new returned no sessionId");
		}
		return { sessionId: result.sessionId };
	}

	prompt(
		sessionId: string,
		prompt: AcpPromptBlock[],
	): Promise<{ stopReason?: string }> {
		return this.request("session/prompt", { sessionId, prompt }).then(
			(result) => {
				if (isRecord(result) && typeof result.stopReason === "string") {
					return { stopReason: result.stopReason };
				}
				return {};
			},
		);
	}

	cancel(sessionId: string): void {
		void this.notify("session/cancel", { sessionId });
		this.rejectPendingRequests(
			"session/prompt",
			new Error("ACP prompt cancelled"),
		);
	}

	async dispose(): Promise<void> {
		const child = this.child;
		this.disposing = true;
		this.child = null;
		this.lines?.close();
		this.lines = null;
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timeout);
			pending.reject(new Error("ACP agent process disposed"));
		}
		this.pending.clear();
		if (!child || this.exited) return;

		const { promise, resolve } = Promise.withResolvers<void>();
		const timeout = setTimeout(resolve, 1000);
		child.once("exit", () => {
			clearTimeout(timeout);
			resolve();
		});
		child.kill("SIGTERM");
		await promise;
		if (!this.exited) child.kill("SIGKILL");
	}

	private startProcess(): void {
		if (this.child) return;
		this.exited = false;
		this.disposing = false;
		const child = spawn(this.options.command, this.options.args, {
			cwd: this.options.cwd,
			env: this.options.env ?? process.env,
			stdio: "pipe",
		});
		this.child = child;
		this.lines = createInterface({
			input: child.stdout,
			crlfDelay: Number.POSITIVE_INFINITY,
		});
		this.lines.on("line", (line) => {
			this.handleLine(line);
		});
		child.stderr.on("data", (chunk: Buffer) => {
			for (const line of chunk.toString("utf-8").split(/\r?\n/)) {
				const trimmed = line.trim();
				if (trimmed.length === 0) continue;
				this.stderrLines.push(trimmed);
				if (this.stderrLines.length > 20) this.stderrLines.shift();
			}
		});
		child.once("error", (error) => {
			this.markExited();
			this.rejectAll(error);
			this.options.onError(error);
		});
		child.once("exit", (code, signal) => {
			this.markExited();
			if (this.disposing) return;
			const suffix =
				this.stderrLines.length > 0 ? `: ${this.stderrLines.join("\n")}` : "";
			const error = new Error(
				`ACP agent exited with code ${code ?? "null"} signal ${signal ?? "null"}${suffix}`,
			);
			this.rejectAll(error);
			this.options.onError(error);
		});
	}

	private async request(method: string, params: unknown): Promise<unknown> {
		const id = this.nextRequestId++;
		const { promise, resolve, reject } = Promise.withResolvers<unknown>();
		const timeout = setTimeout(() => {
			if (!this.pending.delete(id)) return;
			reject(new Error(`ACP request timed out: ${method}`));
		}, DEFAULT_REQUEST_TIMEOUT_MS);
		this.pending.set(id, { method, resolve, reject, timeout });
		try {
			await this.write({ jsonrpc: "2.0", id, method, params });
		} catch (error) {
			const pending = this.pending.get(id);
			if (pending) {
				clearTimeout(pending.timeout);
				this.pending.delete(id);
			}
			reject(error);
		}
		return promise;
	}

	private notify(method: string, params: unknown): Promise<void> {
		return this.write({ jsonrpc: "2.0", method, params });
	}

	private async write(
		message: JsonRpcRequest | JsonRpcNotification | JsonRpcResponse,
	): Promise<void> {
		const child = this.child;
		if (!child) throw new Error("ACP agent process is not running");
		const line = `${JSON.stringify(message)}\n`;
		if (child.stdin.write(line)) return;
		const { promise, resolve, reject } = Promise.withResolvers<void>();
		child.stdin.once("drain", resolve);
		child.stdin.once("error", reject);
		return promise;
	}

	private handleLine(line: string): void {
		let message: unknown;
		try {
			message = JSON.parse(line) as unknown;
		} catch (error) {
			this.options.onError(
				new Error(
					`Invalid ACP JSON line: ${error instanceof Error ? error.message : String(error)}`,
				),
			);
			return;
		}
		if (!isRecord(message)) return;
		if ("id" in message && ("result" in message || "error" in message)) {
			this.handleResponse(message as unknown as JsonRpcResponse);
			return;
		}
		if (typeof message.method !== "string") return;
		if ("id" in message) {
			void this.handleAgentRequest(message as unknown as JsonRpcRequest);
			return;
		}
		this.handleNotification(message as unknown as JsonRpcNotification);
	}

	private handleResponse(message: JsonRpcResponse): void {
		const pending = this.pending.get(message.id);
		if (!pending) return;
		this.pending.delete(message.id);
		clearTimeout(pending.timeout);
		if (message.error) {
			pending.reject(new AcpJsonRpcError(message.error));
			return;
		}
		pending.resolve(message.result);
	}

	private handleNotification(message: JsonRpcNotification): void {
		if (message.method !== "session/update") return;
		if (!isAcpSessionNotification(message.params)) return;
		this.options.onUpdate(message.params);
	}

	private async handleAgentRequest(message: JsonRpcRequest): Promise<void> {
		try {
			if (
				message.method === "session/request_permission" &&
				isAcpPermissionRequest(message.params)
			) {
				const result = await this.options.onPermissionRequest(message.params);
				await this.write({ jsonrpc: "2.0", id: message.id, result });
				return;
			}
			await this.write({
				jsonrpc: "2.0",
				id: message.id,
				error: {
					code: -32601,
					message: `Unsupported ACP client request: ${message.method}`,
				},
			});
		} catch (error) {
			await this.write({
				jsonrpc: "2.0",
				id: message.id,
				error: {
					code: -32603,
					message: error instanceof Error ? error.message : String(error),
				},
			});
		}
	}

	private rejectAll(error: Error): void {
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timeout);
			pending.reject(error);
		}
		this.pending.clear();
	}

	private rejectPendingRequests(method: string, error: Error): void {
		for (const [id, pending] of this.pending) {
			if (pending.method !== method) continue;
			clearTimeout(pending.timeout);
			this.pending.delete(id);
			pending.reject(error);
		}
	}

	private markExited(): void {
		this.exited = true;
		this.child = null;
		this.lines?.close();
		this.lines = null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isAcpSessionNotification(
	value: unknown,
): value is AcpSessionNotification {
	return (
		isRecord(value) &&
		typeof value.sessionId === "string" &&
		isRecord(value.update) &&
		typeof value.update.sessionUpdate === "string"
	);
}

function isAcpPermissionRequest(value: unknown): value is AcpPermissionRequest {
	if (!isRecord(value) || typeof value.sessionId !== "string") return false;
	if (!isRecord(value.toolCall) || !Array.isArray(value.options)) return false;
	return value.options.every(
		(option) =>
			isRecord(option) &&
			typeof option.optionId === "string" &&
			typeof option.name === "string",
	);
}
