import { z } from "zod";
import { gitlabApiFetch } from "./api";
import { gitlabProjectMetadata } from "./cloud-options";
import { gitlabCredentialsFor } from "./connection";
import { openGitlabLfsAction, rewriteGitlabLfsBatch } from "./lfs-actions";
import { loadGitlabSandboxBinding } from "./sandbox-binding";
import { gitlabForkReadTarget, verifyGitlabForkRead } from "./sandbox-fork";
import {
	createGitlabSandboxProxy,
	type GitlabSandboxProxyConfig,
} from "./sandbox-proxy";
import { authorizeGitlabSandboxRequest } from "./sandbox-request";
import { gitlabScopeAllows } from "./scope";
import { safeGitLabStream } from "./stream-transport";
import { safeGitLabFetch } from "./transport";

const metadataLimit = 1048576;
const responseLimit = 20 * metadataLimit;
const binaryLimit = 1073741824;
const binaryDeadline = 900000;

function failure(status: number): Response {
	return new Response(status === 403 ? "Forbidden" : "GitLab request failed", {
		status,
		headers: { "Cache-Control": "no-store" },
	});
}
class RequestDenied extends Error {}
function denied(): never {
	throw new RequestDenied("Forbidden");
}
function abortable<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
	return new Promise((resolve, reject) => {
		const abort = () => reject(new Error("Cancelled"));
		if (signal.aborted) return abort();
		signal.addEventListener("abort", abort, { once: true });
		Promise.resolve()
			.then(() => {
				signal.throwIfAborted();
				return work();
			})
			.then(
				(value) => {
					signal.removeEventListener("abort", abort);
					if (signal.aborted) abort();
					else resolve(value);
				},
				(error) => {
					signal.removeEventListener("abort", abort);
					reject(error);
				},
			);
	});
}
async function readBody(
	body: ReadableStream<Uint8Array> | null,
	limit: number,
	signal: AbortSignal,
): Promise<string> {
	if (!body) return "";
	const reader = body.getReader();
	let size = 0;
	const chunks: Uint8Array[] = [];
	try {
		while (true) {
			const next = await abortable(() => reader.read(), signal);
			if (next.done) break;
			if (!(next.value instanceof Uint8Array)) denied();
			size += next.value.byteLength;
			if (size > limit) denied();
			chunks.push(next.value);
		}
		return new TextDecoder("utf-8", { fatal: true }).decode(
			Buffer.concat(chunks),
		);
	} finally {
		void reader.cancel().catch(() => {});
		reader.releaseLock();
	}
}
function requestHeaders(
	request: Request,
	kind: "git" | "api" | "lfs",
	token: string,
): Headers {
	const headers = new Headers();
	const nominated = (request.headers.get("connection") ?? "")
		.split(",")
		.map((name) => name.trim().toLowerCase());
	const allowed =
		kind === "git" ? ["content-type", "content-encoding", "git-protocol"] : [];
	for (const name of allowed) {
		const value = request.headers.get(name);
		if (value && !nominated.includes(name)) headers.set(name, value);
	}
	if (kind === "git") {
		const encoding = headers.get("content-encoding");
		if (encoding && encoding !== "gzip") denied();
		const protocol = headers.get("git-protocol");
		if (protocol && !/^version=[012]$/.test(protocol)) denied();
		headers.set(
			"Authorization",
			`Basic ${Buffer.from(`oauth2:${token}`).toString("base64")}`,
		);
	} else {
		headers.set(
			"Authorization",
			kind === "lfs"
				? `Basic ${Buffer.from(`oauth2:${token}`).toString("base64")}`
				: `Bearer ${token}`,
		);
		headers.set(
			"Accept",
			kind === "lfs" ? "application/vnd.git-lfs+json" : "application/json",
		);
		headers.set(
			"Content-Type",
			kind === "lfs" ? "application/vnd.git-lfs+json" : "application/json",
		);
	}
	return headers;
}
function leaks(value: string, token: string): boolean {
	return (
		value.includes(token) ||
		value.includes(encodeURIComponent(token)) ||
		value.includes(Buffer.from(`oauth2:${token}`).toString("base64"))
	);
}
function responseHeaders(response: Response, token?: string): Headers {
	const headers = new Headers({ "Cache-Control": "no-store" });
	const nominated = (response.headers.get("connection") ?? "")
		.split(",")
		.map((name) => name.trim().toLowerCase());
	for (const name of [
		"content-type",
		"content-length",
		"content-range",
		"accept-ranges",
		"etag",
		"last-modified",
		"x-next-page",
		"x-prev-page",
		"x-page",
		"x-per-page",
		"x-total",
		"x-total-pages",
	]) {
		const value = response.headers.get(name);
		if (value && !nominated.includes(name)) {
			if (token && leaks(value, token))
				throw new Error("Invalid upstream response");
			headers.set(name, value);
		}
	}
	return headers;
}
function pagination(headers: Headers, origin: string, path: string): void {
	const links: string[] = [];
	for (const [name, rel] of [
		["x-next-page", "next"],
		["x-prev-page", "prev"],
	] as const) {
		const value = headers.get(name);
		if (!value) continue;
		if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
			throw new Error("Invalid upstream pagination");
		const url = new URL(path, origin);
		url.searchParams.set("page", value);
		links.push(`<${url}>; rel="${rel}"`);
	}
	if (links.length) headers.set("Link", links.join(", "));
}
function exactDownload(
	body: ReadableStream<Uint8Array> | null,
	size: number,
	signal: AbortSignal,
): ReadableStream<Uint8Array> {
	const reader = body?.getReader();
	let bytes = 0;
	const cancel = () => {
		void reader?.cancel().catch(() => {});
	};
	signal.addEventListener("abort", cancel, { once: true });
	const cleanup = () => {
		signal.removeEventListener("abort", cancel);
		reader?.releaseLock();
	};
	return new ReadableStream<Uint8Array>(
		{
			async pull(controller) {
				try {
					signal.throwIfAborted();
					const next = reader
						? await abortable(() => reader.read(), signal)
						: { done: true, value: undefined };
					if (next.done) {
						if (bytes !== size) throw new Error("Invalid object size");
						cleanup();
						controller.close();
						return;
					}
					if (!(next.value instanceof Uint8Array))
						throw new Error("Invalid object data");
					bytes += next.value.byteLength;
					if (bytes > size) throw new Error("Invalid object size");
					controller.enqueue(next.value);
				} catch {
					cancel();
					cleanup();
					controller.error(new Error("GitLab object transfer failed"));
				}
			},
			cancel() {
				cancel();
				cleanup();
			},
		},
		{ highWaterMark: 65536, size: (chunk) => chunk?.byteLength ?? 0 },
	);
}
async function upstreamFailure(response: Response): Promise<Response> {
	await response.body?.cancel().catch(() => {});
	return failure(
		response.status >= 400 && response.status <= 599 ? response.status : 502,
	);
}
export function createGitlabSandboxBroker(
	config: GitlabSandboxProxyConfig,
	options: { binaryTimeoutMs?: number } = {},
): (request: Request) => Promise<Response> {
	return createGitlabSandboxProxy(config, async (request, identity, raw) => {
		const timer = new AbortController();
		const deadline = setTimeout(() => timer.abort(), 15000);
		const signal = AbortSignal.any([request.signal, timer.signal]);
		let authorizationComplete = false;
		try {
			signal.throwIfAborted();
			const binding = await loadGitlabSandboxBinding(identity, { signal });
			const scope = binding.scope;
			if (raw.host.toLowerCase() !== new URL(scope.origin).hostname) denied();
			const recheck = async () => {
				try {
					const current = await loadGitlabSandboxBinding(identity, { signal });
					if (current.fingerprint !== binding.fingerprint) denied();
					return current;
				} catch {
					denied();
				}
			};
			if (raw.path.startsWith("/.superset/lfs/")) {
				const body =
					request.method === "POST"
						? await readBody(request.body, 1024, signal)
						: undefined;
				const action = openGitlabLfsAction({
					scope,
					path: raw.path,
					method: request.method,
					body,
					now: Math.floor(Date.now() / 1000),
				});
				if (action.size > binaryLimit) denied();
				const headers = new Headers(action.headers);
				const incomingRange = request.headers.get("range");
				const privateRange = headers.get("range");
				if (incomingRange && privateRange && incomingRange !== privateRange)
					denied();
				const range = incomingRange ?? privateRange;
				let offset = 0;
				if (range) {
					if (action.action !== "download" || !/^bytes=\d+-$/.test(range))
						denied();
					offset = Number(range.slice(6, -1));
					if (!Number.isSafeInteger(offset) || offset >= action.size) denied();
					headers.set("Range", `bytes=${offset}-`);
				}
				if (action.action === "upload" && !headers.has("content-type"))
					headers.set("Content-Type", "application/octet-stream");
				if (action.action === "verify")
					headers.set("Content-Type", "application/vnd.git-lfs+json");
				await recheck();
				authorizationComplete = true;
				if (action.action === "verify") {
					const response = await abortable(
						() =>
							safeGitLabFetch(
								action.url,
								{ method: action.method, headers, body: action.body, signal },
								{
									issuer: action.offHost ? null : undefined,
									maxResponseBytes: metadataLimit,
								},
							),
						signal,
					);
					if (!response.ok) return upstreamFailure(response);
					await readBody(response.body, metadataLimit, signal);
					return new Response(null, {
						status: response.status,
						headers: { "Cache-Control": "no-store" },
					});
				}
				signal.throwIfAborted();
				clearTimeout(deadline);
				const response = await abortable(
					() =>
						safeGitLabStream(
							action.url,
							{
								method: action.method,
								headers,
								body: action.action === "upload" ? request.body : null,
								signal,
							},
							{
								issuer: action.offHost ? null : undefined,
								timeoutMs: Math.min(
									options.binaryTimeoutMs ?? binaryDeadline,
									Math.max(1, action.expiresAt * 1000 - Date.now()),
								),
								maxRequestBytes:
									action.action === "upload" ? Math.max(1, action.size) : 1,
								maxResponseBytes:
									action.action === "download"
										? Math.max(1, action.size)
										: metadataLimit,
								...(action.action === "upload"
									? { contentLength: action.size }
									: {}),
							},
						),
					signal,
				);
				if (!response.ok) return upstreamFailure(response);
				clearTimeout(deadline);
				let size = action.size;
				if (action.action === "download" && response.status === 206) {
					if (
						!range ||
						response.headers.get("content-range") !==
							`bytes ${offset}-${action.size - 1}/${action.size}`
					) {
						await response.body?.cancel();
						throw new Error("Invalid object range");
					}
					size -= offset;
				} else if (action.action === "download" && response.status !== 200) {
					await response.body?.cancel();
					throw new Error("Invalid object response");
				}
				if (action.action === "upload") {
					await readBody(response.body, metadataLimit, signal);
					return new Response(null, {
						status: response.status,
						headers: { "Cache-Control": "no-store" },
					});
				}

				return new Response(
					action.action === "download"
						? exactDownload(response.body, size, signal)
						: response.body,
					{ status: response.status, headers: responseHeaders(response) },
				);
			}
			const gitRpc =
				raw.path === `/${scope.projectPath}.git/git-upload-pack` ||
				raw.path === `/${scope.projectPath}.git/git-receive-pack`;
			const body = gitRpc
				? undefined
				: await readBody(request.body, metadataLimit, signal);
			const forkTarget = gitlabForkReadTarget(
				raw.path,
				request.method,
				request.headers.get("x-superset-gitlab-merge-request"),
			);
			const requestInput = {
				projectId: scope.projectId,
				projectPath: scope.projectPath,
				path: raw.path,
				method: request.method,
				contentType: request.headers.get("content-type") ?? undefined,
				body,
			};
			let plan =
				forkTarget && forkTarget.projectId !== scope.projectId
					? null
					: authorizeGitlabSandboxRequest(requestInput);
			const credentials = await abortable(
				() =>
					gitlabCredentialsFor(scope.connectionId, {
						organizationId: scope.organizationId,
						expected: {
							host: new URL(scope.origin).host,
							projectPath: scope.projectPath,
						},
						send: (origin, token, path, init = {}) =>
							gitlabApiFetch(origin, token, path, { ...init, signal }),
					}),
				signal,
			);
			if (
				!credentials ||
				credentials.organizationId !== scope.organizationId ||
				credentials.connectionId !== scope.connectionId ||
				new URL(`https://${credentials.config.host}`).origin !== scope.origin ||
				!gitlabScopeAllows(credentials.config, scope.projectPath) ||
				((credentials.config.scopeKind ?? "project") === "project" &&
					credentials.config.scopeId !== undefined &&
					credentials.config.scopeId !== String(scope.projectId)) ||
				!credentials.token ||
				/\s/.test(credentials.token)
			)
				denied();
			if (!plan && forkTarget) {
				const fork = await verifyGitlabForkRead({
					origin: scope.origin,
					token: credentials.token,
					selectedProjectId: scope.projectId,
					...forkTarget,
					path: raw.path,
					send: (origin, token, path, init = {}) =>
						gitlabApiFetch(origin, token, path, { ...init, signal }),
				});
				plan = authorizeGitlabSandboxRequest({ ...requestInput, fork });
			}
			if (!plan) denied();
			if (plan.kind !== "api" || !["GET", "HEAD"].includes(request.method)) {
				const response = await abortable(
					() =>
						gitlabApiFetch(
							scope.origin,
							credentials.token,
							`/projects/${scope.projectId}`,
							{ signal },
						),
					signal,
				);
				if (!response.ok) denied();
				const project = gitlabProjectMetadata(
					credentials,
					await response.json(),
				);
				if (
					project?.projectId !== String(scope.projectId) ||
					project.pathWithNamespace !== scope.projectPath ||
					project.cloneUrl !== `${scope.origin}/${scope.projectPath}.git`
				)
					denied();
			}
			if (plan.sameProjectMr !== undefined) {
				const response = await abortable(
					() =>
						gitlabApiFetch(
							scope.origin,
							credentials.token,
							`/projects/${scope.projectId}/merge_requests/${plan.sameProjectMr}`,
							{ signal },
						),
					signal,
				);
				if (!response.ok) denied();
				const mr = z
					.object({
						iid: z.literal(plan.sameProjectMr),
						source_project_id: z.literal(scope.projectId),
						target_project_id: z.literal(scope.projectId),
					})
					.safeParse(await response.json());
				if (!mr.success) denied();
			}
			await recheck();
			authorizationComplete = true;
			const headers = requestHeaders(
				request,
				plan.kind === "git" ? "git" : plan.kind === "api" ? "api" : "lfs",
				credentials.token,
			);
			if (plan.kind === "git") {
				signal.throwIfAborted();
				clearTimeout(deadline);
				const response = await abortable(
					() =>
						safeGitLabStream(
							scope.origin + plan.path,
							{
								method: request.method,
								headers,
								body: gitRpc ? request.body : null,
								signal,
							},
							{
								timeoutMs: options.binaryTimeoutMs ?? binaryDeadline,
								maxRequestBytes: binaryLimit,
								maxResponseBytes: binaryLimit,
							},
						),
					signal,
				);
				if (!response.ok) return upstreamFailure(response);
				return new Response(response.body, {
					status: response.status,
					headers: responseHeaders(response, credentials.token),
				});
			}
			const response = await abortable(
				() =>
					safeGitLabFetch(
						scope.origin + plan.path,
						{ method: request.method, headers, body: plan.body, signal },
						{
							maxResponseBytes:
								plan.responseType === "text" ? metadataLimit : responseLimit,
						},
					),
				signal,
			);
			if (!response.ok) return upstreamFailure(response);
			const text = await readBody(
				response.body,
				plan.responseType === "text" ? metadataLimit : responseLimit,
				signal,
			);
			const outputHeaders = responseHeaders(response, credentials.token);
			outputHeaders.delete("content-length");
			if (plan.responseType === "text")
				outputHeaders.set("content-type", "text/plain; charset=utf-8");
			let output = text;
			if (plan.kind === "lfs-batch") {
				await recheck();
				output = JSON.stringify(
					rewriteGitlabLfsBatch({
						scope,
						batch: JSON.parse(plan.body ?? ""),
						response: JSON.parse(text),
						organizationToken: credentials.token,
						now: Math.floor(Date.now() / 1000),
					}),
				);
			} else {
				if (
					leaks(text, credentials.token) ||
					(plan.responseType !== "text" &&
						text &&
						leaks(JSON.stringify(JSON.parse(text)), credentials.token))
				)
					throw new Error("Invalid upstream response");
				pagination(outputHeaders, scope.origin, plan.path);
			}
			return new Response(
				request.method === "HEAD" ||
					response.status === 204 ||
					response.status === 205
					? null
					: output,
				{ status: response.status, headers: outputHeaders },
			);
		} catch (error) {
			void request.body?.cancel().catch(() => {});
			return failure(
				error instanceof RequestDenied ||
					signal.aborted ||
					!authorizationComplete
					? 403
					: 502,
			);
		} finally {
			clearTimeout(deadline);
		}
	});
}
