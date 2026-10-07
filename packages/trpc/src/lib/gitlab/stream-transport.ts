import { once } from "node:events";
import type { ClientRequest, IncomingMessage } from "node:http";
import { request } from "node:https";
import { gitlabHeaders } from "./headers";
import { type GitLabTransportOptions, resolveGitLabRequest } from "./transport";

export interface GitLabStreamOptions
	extends Omit<GitLabTransportOptions, "maxResponseBytes" | "timeoutMs"> {
	timeoutMs: number;
	maxRequestBytes: number;
	maxResponseBytes: number;
	contentLength?: number;
}
export interface GitLabStreamRequest {
	method?: string;
	headers?: RequestInit["headers"];
	body?: ReadableStream<Uint8Array> | null;
	signal?: AbortSignal;
}
export async function safeGitLabStream(
	input: string | URL,
	init: GitLabStreamRequest,
	options: GitLabStreamOptions,
): Promise<Response> {
	if (
		![
			options.timeoutMs,
			options.maxRequestBytes,
			options.maxResponseBytes,
		].every((value) => Number.isSafeInteger(value) && value > 0) ||
		options.timeoutMs > 2_147_483_647 ||
		(options.contentLength !== undefined &&
			(!Number.isSafeInteger(options.contentLength) ||
				options.contentLength < 0 ||
				options.contentLength > options.maxRequestBytes ||
				(!init.body && options.contentLength > 0)))
	)
		throw new TypeError("Invalid GitLab streaming limit");
	const error = () => new Error("GitLab streaming request failed");
	let headers: ReturnType<typeof gitlabHeaders>;
	try {
		headers = gitlabHeaders(init.headers);
	} catch {
		throw error();
	}
	for (const name of [
		"host",
		"connection",
		"transfer-encoding",
		"content-length",
		"proxy-authorization",
	])
		if (headers.has(name))
			throw new TypeError("Unsupported GitLab streaming header");
	const method = init.method?.toUpperCase() ?? "GET";
	if (init.body && ["GET", "HEAD"].includes(method))
		throw new TypeError("Unsupported GitLab streaming body");
	if (options.contentLength !== undefined)
		headers.set("content-length", String(options.contentLength));
	const timer = new AbortController();
	const deadline = setTimeout(() => timer.abort(), options.timeoutMs);
	const signal = init.signal
		? AbortSignal.any([timer.signal, init.signal])
		: timer.signal;
	try {
		const { url, addresses } = await new Promise<
			Awaited<ReturnType<typeof resolveGitLabRequest>>
		>((resolve, reject) => {
			const abort = () => reject(error());
			if (signal.aborted) return abort();
			signal.addEventListener("abort", abort, { once: true });
			resolveGitLabRequest(input, options.resolve, options.issuer)
				.then(resolve, reject)
				.finally(() => signal.removeEventListener("abort", abort));
		});
		signal.throwIfAborted();
		return await new Promise<Response>((resolve, reject) => {
			let outgoing: ClientRequest | undefined;
			let incoming: IncomingMessage | undefined;
			let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
			let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
			let failed = false;
			let uploaded = false;
			let downloaded = false;
			let finishUpload!: () => void;
			const uploadFinished = new Promise<void>((resolveUpload) => {
				finishUpload = resolveUpload;
			});
			const cleanup = () => {
				clearTimeout(deadline);
				signal.removeEventListener("abort", fail);
			};
			const complete = () => {
				if (uploaded && downloaded) cleanup();
			};
			const fail = () => {
				if (failed) return;
				failed = true;
				finishUpload();
				cleanup();
				timer.abort();
				outgoing?.destroy();
				incoming?.destroy();
				void reader?.cancel().catch(() => {});
				try {
					controller?.error(error());
				} catch {}
				reject(error());
			};
			signal.addEventListener("abort", fail, { once: true });
			if (signal.aborted) return fail();
			outgoing = (options.request ?? request)(
				url,
				{
					method,
					headers: Object.fromEntries(headers),
					signal,
					agent: false,
					lookup: (_hostname, lookupOptions, callback) => {
						const eligible = lookupOptions.family
							? addresses.filter(
									({ family }) => family === lookupOptions.family,
								)
							: addresses;
						const first = eligible[0];
						if (!first) return callback(error(), "", 0);
						if (lookupOptions.all) callback(null, eligible);
						else callback(null, first.address, first.family);
					},
				},
				(message) => {
					incoming = message;
					incoming.on("error", fail);
					const status = incoming.statusCode ?? 502;
					if (status >= 300 && status < 400) return fail();
					try {
						const responseHeaders = gitlabHeaders(incoming.headers);
						const nominated = (responseHeaders.get("connection") ?? "")
							.split(",")
							.map((name) => name.trim().toLowerCase());
						for (const name of [
							...nominated,
							"connection",
							"keep-alive",
							"transfer-encoding",
							"trailer",
							"upgrade",
							"proxy-authenticate",
							"proxy-authorization",
						])
							if (name) responseHeaders.delete(name);
						if (method === "HEAD" || status === 204 || status === 205) {
							const responseSource = incoming;
							void (async () => {
								try {
									let bytes = 0;
									for await (const chunk of responseSource) {
										if (!(chunk instanceof Uint8Array)) return fail();
										bytes += chunk.byteLength;
										if (bytes > options.maxResponseBytes) return fail();
									}
									await uploadFinished;
									if (failed) return;
									downloaded = true;
									complete();
									resolve(
										new Response(null, { status, headers: responseHeaders }),
									);
								} catch {
									fail();
								}
							})();
							return;
						}
						const chunks = incoming[Symbol.asyncIterator]();
						let bytes = 0;
						const body = new ReadableStream<Uint8Array>(
							{
								start(streamController) {
									controller = streamController;
								},
								async pull(streamController) {
									try {
										const next = await chunks.next();
										if (failed) return;
										if (next.done) {
											await uploadFinished;
											if (failed) return;
											downloaded = true;
											streamController.close();
											complete();
											return;
										}
										if (!(next.value instanceof Uint8Array)) return fail();
										bytes += next.value.byteLength;
										if (bytes > options.maxResponseBytes) return fail();
										streamController.enqueue(next.value);
									} catch {
										fail();
									}
								},
								cancel() {
									fail();
								},
							},
							{
								highWaterMark: 65_536,
								size: (chunk) => chunk?.byteLength ?? 0,
							},
						);
						resolve(new Response(body, { status, headers: responseHeaders }));
					} catch {
						fail();
					}
				},
			);
			const destination = outgoing;
			destination.on("error", fail);
			void (async () => {
				let bytes = 0;
				try {
					reader = init.body?.getReader();
					while (reader) {
						const chunk = await reader.read();
						if (failed) return;
						if (chunk.done) break;
						if (!(chunk.value instanceof Uint8Array)) return fail();
						bytes += chunk.value.byteLength;
						if (
							bytes > options.maxRequestBytes ||
							(options.contentLength !== undefined &&
								bytes > options.contentLength)
						)
							return fail();
						if (!destination.write(chunk.value))
							await once(destination, "drain", { signal });
					}
					if (failed) return;
					if (
						options.contentLength !== undefined &&
						bytes !== options.contentLength
					)
						return fail();
					destination.end();
					uploaded = true;
					finishUpload();
					complete();
				} catch {
					fail();
				} finally {
					reader?.releaseLock();
				}
			})();
		});
	} catch {
		clearTimeout(deadline);
		throw error();
	}
}
