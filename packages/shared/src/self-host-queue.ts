import { createHash, timingSafeEqual } from "node:crypto";

export const SELF_HOST_QUEUE_HEADER = "x-self-host-queue";
export const MAX_QUEUE_BODY_BYTES = 1_048_576;
export const MAX_QUEUE_REQUEST_BYTES = 2 * MAX_QUEUE_BODY_BYTES + 65_536;

export interface PublishOpts {
	url: string;
	body?: unknown;
	headers?: Record<string, string>;
	delay?: number | string;
	notBefore?: number;
	retries?: number;
	deduplicationId?: string;
	failureCallback?: string;
}
export interface QueueAcknowledgement {
	messageId: string;
}
export interface JobQueue {
	publishJSON(opts: PublishOpts): Promise<QueueAcknowledgement>;
	batchJSON(items: PublishOpts[]): Promise<QueueAcknowledgement[]>;
}
interface QueuePublicationOptions {
	publicationTimeoutMs?: number;
}
export function createJobQueue<CloudQueue>(
	cloudFactory: () => CloudQueue,
	options: QueuePublicationOptions = {},
): CloudQueue | JobQueue {
	return isSelfHostQueue() ? makeDirectQueue(options) : cloudFactory();
}
export class QueueValidationError extends Error {
	constructor() {
		super("Self-host queue rejected unsupported or invalid publication");
	}
}
export async function readQueueJSON(
	stream: ReadableStream<Uint8Array> | null,
	limit: number,
): Promise<unknown> {
	const reader = stream?.getReader();
	if (!reader) throw new QueueValidationError();
	const chunks: Uint8Array[] = [];
	let length = 0;
	try {
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) break;
			length += chunk.value.byteLength;
			if (length > limit) {
				await reader.cancel();
				throw new QueueValidationError();
			}
			chunks.push(chunk.value);
		}
		return JSON.parse(
			new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
		);
	} catch {
		throw new QueueValidationError();
	} finally {
		reader.releaseLock();
	}
}
export function isSelfHostQueue(): boolean {
	return process.env.SELF_HOST_QUEUE === "1";
}
export function matchesQueueSecret(
	configured: string,
	supplied: string | null,
): boolean {
	if (configured.length < 32 || !supplied) return false;
	return timingSafeEqual(
		createHash("sha256").update(configured).digest(),
		createHash("sha256").update(supplied).digest(),
	);
}
export function isSelfHostQueueRequest(headers: Headers): boolean {
	return (
		isSelfHostQueue() &&
		matchesQueueSecret(
			process.env.SELF_HOST_QUEUE_SECRET ?? "",
			headers.get(SELF_HOST_QUEUE_HEADER),
		)
	);
}
function denseArray(value: unknown[]): boolean {
	if (
		Object.getPrototypeOf(value) !== Array.prototype ||
		Reflect.ownKeys(value).length !== value.length + 1
	)
		return false;
	for (let index = 0; index < value.length; index++) {
		const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
		if (!descriptor?.enumerable || !("value" in descriptor)) return false;
	}
	return true;
}
function jsonValue(
	value: unknown,
	seen = new Set<object>(),
	depth = 0,
): boolean {
	if (depth > 100) return false;
	if (value === null || typeof value === "string" || typeof value === "boolean")
		return true;
	if (typeof value === "number") return Number.isFinite(value);
	if (typeof value !== "object" || seen.has(value)) return false;
	if (
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) !== Object.prototype &&
		Object.getPrototypeOf(value) !== null
	)
		return false;
	seen.add(value);
	const valid = Array.isArray(value)
		? denseArray(value) &&
			value.every((item) => jsonValue(item, seen, depth + 1))
		: Reflect.ownKeys(value).every(
				(key) =>
					typeof key === "string" &&
					Object.getOwnPropertyDescriptor(value, key)?.enumerable === true &&
					"value" in (Object.getOwnPropertyDescriptor(value, key) ?? {}) &&
					jsonValue(Reflect.get(value, key), seen, depth + 1),
			);
	seen.delete(value);
	return valid;
}
export function queueDestination(value: string): URL {
	try {
		if (
			value.includes("\\") ||
			Array.from(value).some((character) => character.charCodeAt(0) <= 32)
		)
			throw new Error();
		const url = new URL(value);
		if (
			!["http:", "https:"].includes(url.protocol) ||
			url.username ||
			url.password ||
			url.hash ||
			!url.pathname.startsWith("/api/")
		)
			throw new Error();
		let path = url.pathname;
		for (let depth = 0; depth < 8; depth++) {
			if (
				/%(?:2f|5c|00)/i.test(path) ||
				path.includes("\\") ||
				path.split("/").some((part) => part === "." || part === "..")
			)
				throw new Error();
			const decoded = decodeURIComponent(path);
			if (decoded === path) return url;
			path = decoded;
		}
		throw new Error();
	} catch {
		throw new QueueValidationError();
	}
}
export function queueDelayMilliseconds(delay: PublishOpts["delay"]): number {
	if (delay === undefined) return 0;
	let seconds: number;
	if (typeof delay === "number") seconds = delay;
	else {
		const match = /^(\d+)(s|m|h|d)$/.exec(delay);
		if (!match) throw new QueueValidationError();
		seconds =
			Number(match[1]) *
			{ s: 1, m: 60, h: 3600, d: 86400 }[match[2] as "s" | "m" | "h" | "d"];
	}
	const milliseconds = seconds * 1000;
	if (!Number.isSafeInteger(milliseconds) || milliseconds < 0)
		throw new QueueValidationError();
	return milliseconds;
}
export function validateQueuePublication(value: unknown): PublishOpts {
	try {
		if (!value || typeof value !== "object" || Array.isArray(value))
			throw new QueueValidationError();
		const allowed = new Set([
			"url",
			"body",
			"headers",
			"delay",
			"notBefore",
			"retries",
			"deduplicationId",
			"failureCallback",
		]);
		if (
			Reflect.ownKeys(value).some(
				(key) => typeof key !== "string" || !allowed.has(key),
			)
		)
			throw new QueueValidationError();
		if (
			!("url" in value) ||
			typeof value.url !== "string" ||
			value.url.length > 8192
		)
			throw new QueueValidationError();
		const opts: PublishOpts = { url: value.url };
		queueDestination(opts.url);
		if ("body" in value && value.body !== undefined) opts.body = value.body;
		if (
			!jsonValue(opts.body === undefined ? {} : opts.body) ||
			Buffer.byteLength(
				JSON.stringify(opts.body === undefined ? {} : opts.body),
			) > MAX_QUEUE_BODY_BYTES
		)
			throw new QueueValidationError();
		if ("headers" in value && value.headers !== undefined) {
			if (
				!value.headers ||
				typeof value.headers !== "object" ||
				Array.isArray(value.headers) ||
				!jsonValue(value.headers) ||
				Object.keys(value.headers).length > 100
			)
				throw new QueueValidationError();
			const headers: Record<string, string> = Object.create(null);
			for (const [name, content] of Object.entries(value.headers)) {
				if (
					!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
					typeof content !== "string" ||
					/[\r\n\0]/.test(content)
				)
					throw new QueueValidationError();
				headers[name] = content;
			}
			if (Buffer.byteLength(JSON.stringify(headers)) > 32_768)
				throw new QueueValidationError();
			new Headers(headers);
			opts.headers = headers;
		}
		if ("delay" in value && value.delay !== undefined) {
			if (typeof value.delay !== "string" && typeof value.delay !== "number")
				throw new QueueValidationError();
			opts.delay = value.delay;
			queueDelayMilliseconds(opts.delay);
		}
		if ("notBefore" in value && value.notBefore !== undefined) {
			if (
				typeof value.notBefore !== "number" ||
				!Number.isSafeInteger(value.notBefore * 1000) ||
				value.notBefore < 0
			)
				throw new QueueValidationError();
			opts.notBefore = value.notBefore;
		}
		if ("retries" in value && value.retries !== undefined) {
			if (
				typeof value.retries !== "number" ||
				!Number.isInteger(value.retries) ||
				value.retries < 0 ||
				value.retries > 20
			)
				throw new QueueValidationError();
			opts.retries = value.retries;
		}
		for (const key of ["deduplicationId", "failureCallback"] as const) {
			if (key in value && Reflect.get(value, key) !== undefined) {
				const entry: unknown = Reflect.get(value, key);
				if (
					typeof entry !== "string" ||
					entry.length === 0 ||
					entry.length > (key === "deduplicationId" ? 512 : 8192)
				)
					throw new QueueValidationError();
				opts[key] = entry;
				if (key === "failureCallback") queueDestination(entry);
			}
		}
		return opts;
	} catch {
		throw new QueueValidationError();
	}
}
export function makeDirectQueue(
	options: QueuePublicationOptions = {},
): JobQueue {
	const timeoutMs = options.publicationTimeoutMs ?? 10_000;
	if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000)
		throw new QueueValidationError();
	const publish = async (body: string): Promise<QueueAcknowledgement> => {
		try {
			const endpoint = new URL(
				process.env.SELF_HOST_QUEUE_URL || "http://127.0.0.1:8789",
			);
			const secret = process.env.SELF_HOST_QUEUE_SECRET ?? "";
			if (
				!isSelfHostQueue() ||
				secret.length < 32 ||
				!["http:", "https:"].includes(endpoint.protocol) ||
				endpoint.username ||
				endpoint.password ||
				endpoint.search ||
				endpoint.hash ||
				endpoint.pathname !== "/"
			)
				throw new Error();
			const response = await fetch(new URL("/jobs", endpoint), {
				method: "POST",
				headers: {
					"content-type": "application/json",
					[SELF_HOST_QUEUE_HEADER]: secret,
				},
				body,
				redirect: "error",
				signal: AbortSignal.timeout(timeoutMs),
			});
			if (response.status !== 202) {
				await response.body?.cancel();
				throw new Error();
			}
			const result = await readQueueJSON(response.body, 4096);
			if (
				!result ||
				typeof result !== "object" ||
				!("messageId" in result) ||
				typeof result.messageId !== "string" ||
				!result.messageId ||
				result.messageId.length > 512
			)
				throw new Error();
			return { messageId: result.messageId };
		} catch {
			throw new Error("Self-host queue persistence acknowledgement failed");
		}
	};
	return {
		publishJSON: async (opts) =>
			publish(JSON.stringify(validateQueuePublication(opts))),
		batchJSON: async (items) => {
			if (!Array.isArray(items) || !denseArray(items))
				throw new QueueValidationError();
			const prepared = items.map((item) =>
				JSON.stringify(validateQueuePublication(item)),
			);
			const acknowledgements: QueueAcknowledgement[] = [];
			for (let offset = 0; offset < prepared.length; offset += 1000) {
				const results = await Promise.allSettled(
					prepared.slice(offset, offset + 1000).map(publish),
				);
				if (results.some((result) => result.status === "rejected"))
					throw new Error("Self-host queue persistence acknowledgement failed");
				for (const result of results)
					if (result.status === "fulfilled")
						acknowledgements.push(result.value);
			}
			return acknowledgements;
		},
	};
}
