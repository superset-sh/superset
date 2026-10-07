import type { LookupAddress } from "node:dns";
import type { ClientRequest, IncomingMessage } from "node:http";
import { type RequestOptions, request } from "node:https";
import { gitlabHeaders } from "./headers";
import {
	parseGitLabOrigin,
	resolveSafeGitLabAddresses,
	SsrfError,
} from "./ssrf";

export interface GitLabTransportOptions {
	resolve?: (hostname: string) => Promise<LookupAddress[]>;
	issuer?: string | null;
	timeoutMs?: number;
	maxResponseBytes?: number;
	request?: (
		url: URL,
		options: RequestOptions,
		callback: (message: IncomingMessage) => void,
	) => ClientRequest;
}

export async function resolveGitLabRequest(
	input: string | URL,
	resolve?: (hostname: string) => Promise<LookupAddress[]>,
	issuer?: string | null,
): Promise<{ url: URL; addresses: LookupAddress[] }> {
	let url: URL;
	try {
		if (typeof input === "string" && /[\s\\]/.test(input)) throw new Error();
		url = new URL(input);
		parseGitLabOrigin(url.origin);
		if (url.protocol !== "https:" || url.username || url.password || url.hash)
			throw new Error();
	} catch {
		throw new SsrfError(
			"GitLab request must use https without embedded credentials or fragments",
		);
	}
	return {
		url,
		addresses: await resolveSafeGitLabAddresses(url, resolve, issuer),
	};
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise((resolve, reject) => {
		const abort = () => reject(signal.reason);
		if (signal.aborted) return abort();
		signal.addEventListener("abort", abort, { once: true });
		promise
			.then(resolve, reject)
			.finally(() => signal.removeEventListener("abort", abort));
	});
}

export async function safeGitLabFetch(
	input: string | URL,
	init: RequestInit = {},
	options: GitLabTransportOptions = {},
): Promise<Response> {
	const timeoutMs = options.timeoutMs ?? 15000;
	const maxBytes = options.maxResponseBytes ?? 20 * 1024 * 1024;
	if (
		!Number.isSafeInteger(timeoutMs) ||
		timeoutMs <= 0 ||
		!Number.isSafeInteger(maxBytes) ||
		maxBytes <= 0
	)
		throw new TypeError("Invalid GitLab transport limit");
	const headers = gitlabHeaders(init.headers);
	for (const name of [
		"host",
		"connection",
		"transfer-encoding",
		"content-length",
		"proxy-authorization",
	])
		if (headers.has(name))
			throw new TypeError("Unsupported GitLab transport header");
	const body = init.body;
	if (
		body != null &&
		typeof body !== "string" &&
		!(body instanceof URLSearchParams)
	)
		throw new TypeError("Unsupported GitLab request body");
	const signal = init.signal
		? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
		: AbortSignal.timeout(timeoutMs);
	const { url, addresses } = await abortable(
		resolveGitLabRequest(input, options.resolve, options.issuer),
		signal,
	);
	signal.throwIfAborted();
	return new Promise((resolve, reject) => {
		const outgoing = (options.request ?? request)(
			url,
			{
				method: init.method ?? "GET",
				headers: Object.fromEntries(headers.entries()),
				signal,
				agent: false,
				lookup: (_hostname, lookupOptions, callback) => {
					const eligible = lookupOptions.family
						? addresses.filter(({ family }) => family === lookupOptions.family)
						: addresses;
					const first = eligible[0];
					if (!first)
						return callback(
							new SsrfError("GitLab address family unavailable"),
							"",
							0,
						);
					if (lookupOptions.all) callback(null, eligible);
					else callback(null, first.address, first.family);
				},
			},
			async (incoming) => {
				try {
					const status = incoming.statusCode ?? 502;
					if (status >= 300 && status < 400) {
						incoming.destroy();
						throw new SsrfError("GitLab redirects are not allowed");
					}
					const chunks: Buffer[] = [];
					let bytes = 0;
					for await (const chunk of incoming) {
						bytes += chunk.length;
						if (bytes > maxBytes) {
							incoming.destroy();
							throw new Error("GitLab response exceeds the size limit");
						}
						chunks.push(Buffer.from(chunk));
					}
					const responseHeaders = gitlabHeaders(incoming.headers);
					resolve(
						new Response(
							status === 204 ||
								status === 205 ||
								init.method?.toUpperCase() === "HEAD"
								? null
								: Buffer.concat(chunks),
							{ status, headers: responseHeaders },
						),
					);
				} catch (error) {
					reject(error);
				}
			},
		);
		outgoing.on("error", reject);
		outgoing.end(body?.toString());
	});
}
