import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { isIP, type Socket } from "node:net";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { resolveGitlabSandboxForwardURL } from "./proxy-config";
import type { GitlabSandboxProxyConfig } from "./sandbox-proxy";

export function parseGitlabListen(args: string[]): {
	host: string;
	port: number;
} {
	if (args.length === 0) return { host: "127.0.0.1", port: 8790 };
	if (args.length !== 2 || args[0] !== "--listen")
		throw new Error("Invalid listen option");
	const match = /^(?:\[([0-9a-f:]+)\]|([A-Za-z0-9.-]+)):([0-9]{1,5})$/i.exec(
		args[1] ?? "",
	);
	const host = match?.[1] ?? match?.[2];
	const port = Number(match?.[3]);
	if (
		!host ||
		!Number.isInteger(port) ||
		port < 1 ||
		port > 65535 ||
		(match?.[1]
			? isIP(host) !== 6
			: !host
					.split(".")
					.every((part) =>
						/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part),
					))
	)
		throw new Error("Invalid listen option");
	return { host, port };
}

const hopHeaders = new Set([
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
]);
function hasControlCharacters(value: string): boolean {
	return Array.from(value).some(
		(character) =>
			character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
	);
}
function mountedTarget(target: string, mount: string): boolean {
	if (
		target.length > 16384 ||
		!target.startsWith("/") ||
		target.startsWith("//") ||
		/[\s\\#]/.test(target) ||
		hasControlCharacters(target)
	)
		return false;
	const path = target.split("?")[0] ?? "";
	if (mount !== "/" && path !== mount && !path.startsWith(`${mount}/`))
		return false;
	for (const segment of path.split("/")) {
		let value = segment;
		for (let depth = 0; depth < 8; depth++) {
			if (
				value.includes("\\") ||
				hasControlCharacters(value) ||
				value.split("/").some((part) => part === "." || part === "..")
			)
				return false;
			try {
				const decoded = decodeURIComponent(value);
				if (decoded === value) break;
				if (depth === 7) return false;
				value = decoded;
			} catch {
				if (depth === 0) return false;
				break;
			}
		}
	}
	return true;
}
function failure(response: ServerResponse, status: number) {
	if (response.destroyed || response.writableEnded) return;
	if (response.headersSent) {
		response.destroy();
		return;
	}
	response.writeHead(status, {
		"cache-control": "no-store",
		"content-type": "text/plain; charset=utf-8",
		connection: "close",
	});
	response.end(
		status === 404
			? "Not found"
			: status === 405
				? "Method not allowed"
				: "GitLab request failed",
	);
}

export function createGitlabNodeServer(options: {
	config: GitlabSandboxProxyConfig;
	handler: (request: Request) => Promise<Response>;
	limits?: {
		activeRequests?: number;
		connections?: number;
		requestMs?: number;
		shutdownMs?: number;
	};
}) {
	if (
		resolveGitlabSandboxForwardURL({ proxyURL: options.config.forwardURL }) !==
		options.config.forwardURL
	)
		throw new Error("Invalid public broker URL");
	const endpoint = new URL(options.config.forwardURL);
	const limits = {
		activeRequests: 32,
		connections: 128,
		requestMs: 960000,
		shutdownMs: 5000,
		...options.limits,
	};
	for (const value of Object.values(limits))
		if (!Number.isSafeInteger(value) || value < 1 || value > 2147483647)
			throw new Error("Invalid server limits");
	const active = new Set<AbortController>();
	const sockets = new Set<Socket>();
	let stopping = false;
	let closing: Promise<void> | undefined;
	const server = createServer(
		{
			maxHeaderSize: 32768,
			headersTimeout: 15000,
			connectionsCheckingInterval: 1000,
			requestTimeout: 0,
			keepAliveTimeout: 5000,
		},
		(incoming, outgoing) => {
			if (stopping || active.size >= limits.activeRequests) {
				failure(outgoing, 503);
				return;
			}
			if (
				incoming.url === "/healthz" &&
				!mountedTarget("/healthz", endpoint.pathname) &&
				["GET", "HEAD"].includes(incoming.method ?? "")
			) {
				outgoing.writeHead(200, {
					"content-type": "text/plain; charset=utf-8",
					"cache-control": "no-store",
					connection: "close",
				});
				outgoing.end(incoming.method === "HEAD" ? undefined : "ok");
				return;
			}
			if (!mountedTarget(incoming.url ?? "", endpoint.pathname)) {
				failure(outgoing, 404);
				return;
			}
			if (!["GET", "HEAD", "POST", "PUT"].includes(incoming.method ?? "")) {
				failure(outgoing, 405);
				return;
			}
			const controller = new AbortController();
			active.add(controller);
			let abortStatus = 502;
			const abort = () => controller.abort();
			const prematureClose = () => {
				if (!outgoing.writableFinished) abort();
			};
			const incomingClose = () => {
				if (!incoming.complete) abort();
			};
			incoming.on("aborted", abort);
			incoming.on("error", abort);
			incoming.on("close", incomingClose);
			outgoing.on("close", prematureClose);
			const timer = setTimeout(() => {
				abortStatus = 504;
				abort();
			}, limits.requestMs);
			timer.unref();
			const cleanup = () => {
				clearTimeout(timer);
				active.delete(controller);
				incoming.off("aborted", abort);
				incoming.off("error", abort);
				incoming.off("close", incomingClose);
				outgoing.off("close", prematureClose);
			};
			outgoing.once("finish", cleanup);
			outgoing.once("close", cleanup);
			void serve(
				incoming,
				outgoing,
				controller,
				endpoint.origin,
				options.handler,
			).catch(() => {
				failure(outgoing, stopping ? 503 : abortStatus);
			});
		},
	);
	server.on("connection", (socket) => {
		if (stopping || sockets.size >= limits.connections) {
			socket.destroy();
			return;
		}
		sockets.add(socket);
		socket.once("close", () => sockets.delete(socket));
	});
	server.on("clientError", (_error, socket) => {
		if (socket.writable)
			socket.end(
				"HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
			);
		else socket.destroy();
	});
	server.on("upgrade", (_request, socket) => socket.destroy());
	server.on("connect", (_request, socket) => socket.destroy());
	return {
		server,
		shutdown(): Promise<void> {
			if (closing) return closing;
			stopping = true;
			for (const controller of active) controller.abort();
			closing = new Promise((resolve) => {
				const timer = setTimeout(() => {
					for (const socket of sockets) socket.destroy();
					resolve();
				}, limits.shutdownMs);
				server.close(() => {
					clearTimeout(timer);
					resolve();
				});
				server.closeIdleConnections();
			});
			return closing;
		},
	};
}

function uploadBody(incoming: IncomingMessage, signal: AbortSignal) {
	let controller: ReadableStreamDefaultController<Uint8Array>;
	let stopped = false;
	const detach = () => {
		stopped = true;
		incoming.off("readable", pump);
		incoming.off("end", end);
		incoming.off("error", error);
		signal.removeEventListener("abort", abort);
		incoming.pause();
	};
	const pump = () => {
		while (!stopped && (controller.desiredSize ?? 0) > 0) {
			const chunk = incoming.read() as Buffer | null;
			if (!chunk) break;
			controller.enqueue(chunk);
		}
	};
	const end = () => {
		if (!stopped) {
			detach();
			controller.close();
		}
	};
	const error = () => {
		if (!stopped) {
			detach();
			controller.error(new Error("Upload cancelled"));
		}
	};
	const abort = error;
	const body = new ReadableStream<Uint8Array>(
		{
			start(value) {
				controller = value;
				incoming.on("readable", pump);
				incoming.once("end", end);
				incoming.once("error", error);
				signal.addEventListener("abort", abort, { once: true });
				if (signal.aborted) abort();
			},
			pull: pump,
			cancel: detach,
		},
		{ highWaterMark: 65536, size: (chunk) => chunk?.byteLength ?? 0 },
	);
	return { body, stop: error };
}

async function serve(
	incoming: IncomingMessage,
	outgoing: ServerResponse,
	controller: AbortController,
	origin: string,
	handler: (request: Request) => Promise<Response>,
) {
	const headers = new Headers();
	const connectionNames = new Set(
		(incoming.headers?.connection ?? "")
			.toLowerCase()
			.split(",")
			.map((name) => name.trim()),
	);
	for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
		const name = incoming.rawHeaders[index] ?? "";
		if (
			name.toLowerCase() !== "host" &&
			!hopHeaders.has(name.toLowerCase()) &&
			!connectionNames.has(name.toLowerCase())
		)
			headers.append(name, incoming.rawHeaders[index + 1] ?? "");
	}
	const method = incoming.method ?? "GET";
	const upload =
		method === "POST" || method === "PUT"
			? uploadBody(incoming, controller.signal)
			: undefined;

	const request = new Request(origin + incoming.url, {
		method,
		headers,
		signal: controller.signal,
		...(method === "POST" || method === "PUT"
			? {
					body: upload?.body,
					duplex: "half",
				}
			: {}),
	});
	let onAbort!: () => void;
	const aborted = new Promise<never>((_resolve, reject) => {
		onAbort = () => reject(new Error("Cancelled"));
		controller.signal.addEventListener("abort", onAbort, { once: true });
		if (controller.signal.aborted) onAbort();
	});
	const pending = Promise.resolve().then(() => {
		controller.signal.throwIfAborted();
		return handler(request);
	});
	void pending.then(
		(response) => {
			if (controller.signal.aborted)
				void response.body?.cancel().catch(() => {});
		},
		() => {},
	);
	try {
		const response = await Promise.race([pending, aborted]);
		controller.signal.throwIfAborted();
		const outputHeaders: Record<string, string> = {};
		const connection = new Set(
			(response.headers.get("connection") ?? "")
				.toLowerCase()
				.split(",")
				.map((name) => name.trim()),
		);
		for (const [name, value] of response.headers)
			if (!hopHeaders.has(name) && !connection.has(name))
				outputHeaders[name] = value;
		if (!incoming.readableEnded) outputHeaders.connection = "close";
		outgoing.writeHead(response.status, outputHeaders);
		if (!response.body || method === "HEAD") {
			void response.body?.cancel().catch(() => {});
			outgoing.end();
		} else {
			const body = Readable.fromWeb(response.body);
			await pipeline(body, outgoing, { signal: controller.signal });
		}
	} finally {
		upload?.stop();
		controller.signal.removeEventListener("abort", onAbort);
	}
}
