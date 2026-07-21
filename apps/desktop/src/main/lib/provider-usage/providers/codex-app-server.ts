import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

export type CodexRateLimitsReadResult =
	| { status: "ok"; value: unknown }
	| { status: "not-configured" }
	| { status: "unavailable" };

export interface CodexAppServerProcess {
	stdin: Pick<Writable, "write" | "end">;
	stdout: Readable;
	onError: (listener: (error: NodeJS.ErrnoException) => void) => void;
	onExit: (listener: () => void) => void;
	close: () => void;
}

interface CodexAppServerReaderDependencies {
	startServer: () => CodexAppServerProcess;
	timeoutMs?: number;
}

function startCodexAppServer(): CodexAppServerProcess {
	const child = spawn("codex", ["app-server", "--stdio"], {
		env: process.env,
		stdio: ["pipe", "pipe", "ignore"],
	});
	return {
		stdin: child.stdin,
		stdout: child.stdout,
		onError: (listener) => child.once("error", listener),
		onExit: (listener) => child.once("exit", listener),
		close: () => {
			child.stdin.end();
			if (child.exitCode === null) child.kill();
		},
	};
}

function isMissingExecutable(error: NodeJS.ErrnoException): boolean {
	return error.code === "ENOENT";
}

export function createCodexAppServerReader(
	dependencies: CodexAppServerReaderDependencies,
): () => Promise<CodexRateLimitsReadResult> {
	return async () =>
		new Promise((resolve) => {
			let server: CodexAppServerProcess;
			try {
				server = dependencies.startServer();
			} catch (error) {
				resolve(
					isMissingExecutable(error as NodeJS.ErrnoException)
						? { status: "not-configured" }
						: { status: "unavailable" },
				);
				return;
			}

			let settled = false;
			const lines = createInterface({ input: server.stdout });
			const finish = (result: CodexRateLimitsReadResult) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				lines.close();
				server.close();
				resolve(result);
			};
			const send = (message: Record<string, unknown>) => {
				server.stdin.write(`${JSON.stringify(message)}\n`);
			};
			const timeout = setTimeout(
				() => finish({ status: "unavailable" }),
				dependencies.timeoutMs ?? 10_000,
			);

			server.onError((error) => {
				finish(
					isMissingExecutable(error)
						? { status: "not-configured" }
						: { status: "unavailable" },
				);
			});
			server.onExit(() => finish({ status: "unavailable" }));
			lines.on("line", (line) => {
				let message: unknown;
				try {
					message = JSON.parse(line);
				} catch {
					return;
				}
				if (!message || typeof message !== "object") return;
				const response = message as {
					id?: unknown;
					result?: unknown;
					error?: unknown;
				};

				if (response.id === 1) {
					if (response.error || !response.result) {
						finish({ status: "unavailable" });
						return;
					}
					send({ jsonrpc: "2.0", method: "initialized" });
					send({
						jsonrpc: "2.0",
						id: 2,
						method: "account/rateLimits/read",
						params: null,
					});
				} else if (response.id === 2) {
					finish(
						response.error || response.result === undefined
							? { status: "unavailable" }
							: { status: "ok", value: response.result },
					);
				}
			});

			send({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					clientInfo: { name: "superset-ai-meter", version: "1" },
				},
			});
		});
}

export const readCodexRateLimits = createCodexAppServerReader({
	startServer: startCodexAppServer,
});
