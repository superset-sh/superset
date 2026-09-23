// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import type {
	BodyInit,
	RequestInfo,
	RequestInit,
} from "./internal/builtin-types";
import type {
	FinalizedRequestInit,
	HTTPMethod,
	MergedRequestInit,
	PromiseOrValue,
} from "./internal/types";
import { sleep } from "./internal/utils/sleep";
import { uuid4 } from "./internal/utils/uuid";
import {
	isAbsoluteURL,
	safeJSON,
	validatePositiveInteger,
} from "./internal/utils/values";

export type { Logger, LogLevel } from "./internal/utils/log";

import { APIPromise } from "./core/api-promise";
import * as Errors from "./core/error";
import * as Uploads from "./core/uploads";
import type { Fetch } from "./internal/builtin-types";
import { getPlatformHeaders } from "./internal/detect-platform";
import { castToError, isAbortError } from "./internal/errors";
import {
	buildHeaders,
	type HeadersLike,
	type NullableHeaders,
} from "./internal/headers";
import { type APIResponseProps, defaultParseResponse } from "./internal/parse";
import type {
	FinalRequestOptions,
	RequestOptions,
} from "./internal/request-options";
import * as Opts from "./internal/request-options";
import * as Shims from "./internal/shims";
import { readEnv } from "./internal/utils/env";
import {
	formatRequestDetails,
	type Logger,
	type LogLevel,
	loggerFor,
	parseLogLevel,
} from "./internal/utils/log";
import { stringifyQuery } from "./internal/utils/query";
import { isEmptyObj } from "./internal/utils/values";
import {
	AgentCreateParams,
	AgentCreateResult,
	Agents,
} from "./resources/agents";
import * as API from "./resources/index";
import {
	Member,
	MemberListParams,
	MemberListResponse,
	Members,
	Organization,
	OrganizationRole,
} from "./resources/organization";
import {
	Task,
	TaskCreateParams,
	TaskListItem,
	TaskListParams,
	TaskListResponse,
	Tasks,
	TaskStatus,
	TaskStatuses,
	TaskStatusListResponse,
	TaskUpdateParams,
} from "./resources/tasks";
import {
	TerminalCloseParams,
	TerminalCloseResult,
	TerminalCreateParams,
	TerminalCreateResult,
	TerminalListParams,
	TerminalListResult,
	TerminalReadParams,
	TerminalReadResult,
	Terminals,
	TerminalSendParams,
	TerminalSendResult,
	TerminalSummary,
} from "./resources/terminals";
import {
	CloudWorkspace,
	CloudWorkspaceStatus,
	WorkspaceCreateParams,
	WorkspaceDeleteResult,
	WorkspaceListParams,
	WorkspaceListResponse,
	Workspaces,
	WorkspaceUpdateParams,
} from "./resources/workspaces";
import {
	buildCaptureRequest,
	buildMethodCalledEvent,
	isTelemetryEnabled,
	resolveTelemetryKey,
	type TelemetryTarget,
	type TRPCCall,
} from "./lib/telemetry";
import { VERSION } from "./version";

export interface ClientOptions {
	/**
	 * Defaults to process.env['SUPERSET_API_KEY'].
	 */
	apiKey?: string | undefined;

	/**
	 * Organization ID to scope every request to. Sent as the
	 * `x-superset-organization-id` header. Defaults to
	 * process.env['SUPERSET_ORGANIZATION_ID'].
	 *
	 * Required for any procedure that calls `requireActiveOrgMembership` —
	 * which is most resources (tasks, workspaces, organization, …).
	 */
	organizationId?: string | undefined;

	/**
	 * Override the default base URL for the API, e.g., "https://api.example.com/v2/"
	 *
	 * Defaults to process.env['SUPERSET_BASE_URL'].
	 */
	baseURL?: string | null | undefined;

	/**
	 * The maximum amount of time (in milliseconds) that the client should wait for a response
	 * from the server before timing out a single request.
	 *
	 * Note that request timeouts are retried by default, so in a worst-case scenario you may wait
	 * much longer than this timeout before the promise succeeds or fails.
	 *
	 * @unit milliseconds
	 */
	timeout?: number | undefined;
	/**
	 * Additional `RequestInit` options to be passed to `fetch` calls.
	 * Properties will be overridden by per-request `fetchOptions`.
	 */
	fetchOptions?: MergedRequestInit | undefined;

	/**
	 * Specify a custom `fetch` function implementation.
	 *
	 * If not provided, we expect that `fetch` is defined globally.
	 */
	fetch?: Fetch | undefined;

	/**
	 * The maximum number of times that the client will retry a request in case of a
	 * temporary failure, like a network error or a 5XX error from the server.
	 *
	 * @default 2
	 */
	maxRetries?: number | undefined;

	/**
	 * Default headers to include with every request to the API.
	 *
	 * These can be removed in individual requests by explicitly setting the
	 * header to `null` in request options.
	 */
	defaultHeaders?: HeadersLike | undefined;

	/**
	 * Default query parameters to include with every request to the API.
	 *
	 * These can be removed in individual requests by explicitly setting the
	 * param to `undefined` in request options.
	 */
	defaultQuery?: Record<string, string | undefined> | undefined;

	/**
	 * Set the log level.
	 *
	 * Defaults to process.env['SUPERSET_LOG'] or 'warn' if it isn't set.
	 */
	logLevel?: LogLevel | undefined;

	/**
	 * Set the logger.
	 *
	 * Defaults to globalThis.console.
	 */
	logger?: Logger | undefined;
}

/**
 * Wire shape of a successful tRPC response when the server uses the SuperJSON
 * transformer. Errors are surfaced as HTTP 4xx/5xx and handled by the request
 * layer's status-error path.
 */
type TRPCEnvelope<T> = {
	result: { data: { json: T; meta?: unknown } };
};

/** A ticket for one cloud workspace's sandbox gate; re-minted at `staleAt` (epoch ms). */
interface WorkspaceAccess {
	url: string;
	token: string;
	staleAt: number;
}

/** Re-mint this long before the ticket expires. */
const ACCESS_EXPIRY_MARGIN_MS = 60_000;
/**
 * A ticket names the sandbox's address, which can change when a stopped
 * session resumes; asking again this often keeps a long-running script
 * pointed at the session that answers.
 */
const ACCESS_REFRESH_MS = 10 * 60_000;

/**
 * API Client for interfacing with the Superset API.
 */
export class Superset {
	apiKey: string;
	organizationId: string | null;

	baseURL: string;
	maxRetries: number;
	timeout: number;
	logger: Logger;
	logLevel: LogLevel | undefined;
	fetchOptions: MergedRequestInit | undefined;

	private fetch: Fetch;
	#encoder: Opts.RequestEncoder;
	protected idempotencyHeader?: string;
	private _options: ClientOptions;
	private _workspaceAccess = new Map<string, WorkspaceAccess>();
	private _wakeNext = new Set<string>();
	private _workspaceAccessInflight = new Map<
		string,
		Promise<WorkspaceAccess>
	>();
	private _telemetryEnabled = isTelemetryEnabled();

	/**
	 * API Client for interfacing with the Superset API.
	 *
	 * @param {string | undefined} [opts.apiKey=process.env['SUPERSET_API_KEY'] ?? undefined]
	 * @param {string} [opts.baseURL=process.env['SUPERSET_BASE_URL'] ?? https://api.superset.sh] - Override the default base URL for the API.
	 * @param {number} [opts.timeout=1 minute] - The maximum amount of time (in milliseconds) the client will wait for a response before timing out.
	 * @param {MergedRequestInit} [opts.fetchOptions] - Additional `RequestInit` options to be passed to `fetch` calls.
	 * @param {Fetch} [opts.fetch] - Specify a custom `fetch` function implementation.
	 * @param {number} [opts.maxRetries=2] - The maximum number of times the client will retry a request.
	 * @param {HeadersLike} opts.defaultHeaders - Default headers to include with every request to the API.
	 * @param {Record<string, string | undefined>} opts.defaultQuery - Default query parameters to include with every request to the API.
	 */
	constructor({
		baseURL = readEnv("SUPERSET_BASE_URL"),
		apiKey = readEnv("SUPERSET_API_KEY"),
		organizationId = readEnv("SUPERSET_ORGANIZATION_ID"),
		...opts
	}: ClientOptions = {}) {
		if (apiKey === undefined) {
			throw new Errors.SupersetError(
				"The SUPERSET_API_KEY environment variable is missing or empty; either provide it, or instantiate the Superset client with an apiKey option, like new Superset({ apiKey: 'My API Key' }).",
			);
		}

		const options: ClientOptions = {
			apiKey,
			organizationId,
			...opts,
			baseURL: baseURL || `https://api.superset.sh`,
		};

		this.baseURL = options.baseURL!;
		this.timeout = options.timeout ?? Superset.DEFAULT_TIMEOUT /* 1 minute */;
		this.logger = options.logger ?? console;
		const defaultLogLevel = "warn";
		// Set default logLevel early so that we can log a warning in parseLogLevel.
		this.logLevel = defaultLogLevel;
		this.logLevel =
			parseLogLevel(options.logLevel, "ClientOptions.logLevel", this) ??
			parseLogLevel(
				readEnv("SUPERSET_LOG"),
				"process.env['SUPERSET_LOG']",
				this,
			) ??
			defaultLogLevel;
		this.fetchOptions = options.fetchOptions;
		this.maxRetries = options.maxRetries ?? 2;
		this.fetch = options.fetch ?? Shims.getDefaultFetch();
		this.#encoder = Opts.FallbackEncoder;

		const customHeadersEnv = readEnv("SUPERSET_CUSTOM_HEADERS");
		if (customHeadersEnv) {
			const parsed: Record<string, string> = {};
			for (const line of customHeadersEnv.split("\n")) {
				const colon = line.indexOf(":");
				if (colon >= 0) {
					parsed[line.substring(0, colon).trim()] = line
						.substring(colon + 1)
						.trim();
				}
			}
			options.defaultHeaders = { ...parsed, ...options.defaultHeaders };
		}

		this._options = options;

		this.apiKey = apiKey;
		this.organizationId = organizationId ?? null;
	}

	/**
	 * Create a new client instance re-using the same options given to the current client with optional overriding.
	 */
	withOptions(options: Partial<ClientOptions>): this {
		const client = new (
			this.constructor as any as new (
				props: ClientOptions,
			) => typeof this
		)({
			...this._options,
			baseURL: this.baseURL,
			maxRetries: this.maxRetries,
			timeout: this.timeout,
			logger: this.logger,
			logLevel: this.logLevel,
			fetch: this.fetch,
			fetchOptions: this.fetchOptions,
			apiKey: this.apiKey,
			organizationId: this.organizationId ?? undefined,
			...options,
		});
		return client;
	}

	/**
	 * Check whether the base URL is set to its default.
	 */
	#baseURLOverridden(): boolean {
		return this.baseURL !== "https://api.superset.sh";
	}

	protected defaultQuery(): Record<string, string | undefined> | undefined {
		return this._options.defaultQuery;
	}

	protected validateHeaders({ values, nulls }: NullableHeaders) {
		return;
	}

	protected async authHeaders(
		_opts: FinalRequestOptions,
	): Promise<NullableHeaders | undefined> {
		const auth: Record<string, string> =
			this.apiKey.startsWith("sk_live_") || this.apiKey.startsWith("sk_test_")
				? { "x-api-key": this.apiKey }
				: { Authorization: `Bearer ${this.apiKey}` };
		if (this.organizationId) {
			auth["x-superset-organization-id"] = this.organizationId;
		}
		return buildHeaders([auth]);
	}

	protected stringifyQuery(query: object | Record<string, unknown>): string {
		return stringifyQuery(query);
	}

	private getUserAgent(): string {
		return `${this.constructor.name}/JS ${VERSION}`;
	}

	protected defaultIdempotencyKey(): string {
		return `stainless-node-retry-${uuid4()}`;
	}

	protected makeStatusError(
		status: number,
		error: Object,
		message: string | undefined,
		headers: Headers,
	): Errors.APIError {
		return Errors.APIError.generate(status, error, message, headers);
	}

	buildURL(
		path: string,
		query: Record<string, unknown> | null | undefined,
		defaultBaseURL?: string | undefined,
	): string {
		const baseURL =
			(!this.#baseURLOverridden() && defaultBaseURL) || this.baseURL;
		const url = isAbsoluteURL(path)
			? new URL(path)
			: new URL(
					baseURL +
						(baseURL.endsWith("/") && path.startsWith("/")
							? path.slice(1)
							: path),
				);

		const defaultQuery = this.defaultQuery();
		const pathQuery = Object.fromEntries(url.searchParams);
		if (!isEmptyObj(defaultQuery) || !isEmptyObj(pathQuery)) {
			query = { ...pathQuery, ...defaultQuery, ...query };
		}

		if (typeof query === "object" && query && !Array.isArray(query)) {
			url.search = this.stringifyQuery(query);
		}

		return url.toString();
	}

	/**
	 * Used as a callback for mutating the given `FinalRequestOptions` object.
	 */
	protected async prepareOptions(
		_options: FinalRequestOptions,
	): Promise<void> {}

	/**
	 * Used as a callback for mutating the given `RequestInit` object.
	 *
	 * This is useful for cases where you want to add certain headers based off of
	 * the request properties, e.g. `method` or `url`.
	 */
	protected async prepareRequest(
		_request: RequestInit,
		{ url, options }: { url: string; options: FinalRequestOptions },
	): Promise<void> {}

	get<Rsp>(
		path: string,
		opts?: PromiseOrValue<RequestOptions>,
	): APIPromise<Rsp> {
		return this.methodRequest("get", path, opts);
	}

	post<Rsp>(
		path: string,
		opts?: PromiseOrValue<RequestOptions>,
	): APIPromise<Rsp> {
		return this.methodRequest("post", path, opts);
	}

	patch<Rsp>(
		path: string,
		opts?: PromiseOrValue<RequestOptions>,
	): APIPromise<Rsp> {
		return this.methodRequest("patch", path, opts);
	}

	put<Rsp>(
		path: string,
		opts?: PromiseOrValue<RequestOptions>,
	): APIPromise<Rsp> {
		return this.methodRequest("put", path, opts);
	}

	delete<Rsp>(
		path: string,
		opts?: PromiseOrValue<RequestOptions>,
	): APIPromise<Rsp> {
		return this.methodRequest("delete", path, opts);
	}

	/**
	 * Invoke a tRPC mutation procedure (e.g. `task.create`). Wraps input in the
	 * SuperJSON `{ json: ... }` envelope and unwraps the response from
	 * `{ result: { data: { json: ... } } }`.
	 */
	mutation<Rsp>(
		call: TRPCCall,
		input?: unknown,
		options?: RequestOptions,
	): APIPromise<Rsp> {
		return this._trackedRequest<Rsp>(call, "cloud", {
			method: "post",
			path: `/api/trpc/${call.procedure}`,
			body: { json: input ?? null },
			...options,
		});
	}

	/**
	 * Invoke a tRPC query procedure (e.g. `task.list`). Encodes input as a
	 * `?input=<json>` query param when provided, and unwraps the response.
	 */
	query<Rsp>(
		call: TRPCCall,
		input?: unknown,
		options?: RequestOptions,
	): APIPromise<Rsp> {
		const queryParams: Record<string, string> = {};
		if (input !== undefined) {
			queryParams.input = JSON.stringify({ json: input });
		}
		return this._trackedRequest<Rsp>(call, "cloud", {
			method: "get",
			path: `/api/trpc/${call.procedure}`,
			query: queryParams,
			...options,
		});
	}

	/**
	 * Invoke a host-service tRPC mutation inside a cloud workspace's sandbox.
	 * The call goes to the workspace's sandbox gate with a ticket minted by
	 * `cloudWorkspace.access`; the API key never leaves for the gate, which
	 * forwards request headers into the sandbox.
	 */
	workspaceMutation<Rsp>(
		workspaceId: string,
		call: TRPCCall,
		input?: unknown,
		options?: RequestOptions,
	): APIPromise<Rsp> {
		const optsPromise = this._getWorkspaceAccess(workspaceId).then(
			(access) => ({
				// Caller options first (timeout, retries, signal, etc.) — body and
				// auth headers are then forced so per-call options can't strip the
				// ticket or replace the tRPC envelope.
				...options,
				method: "post" as const,
				path: `${access.url}/trpc/${call.procedure}`,
				body: { json: input ?? null },
				headers: this._gateHeaders(access, options),
			}),
		);
		return this._forgetAccessOnFailure(
			workspaceId,
			this._trackedRequest<Rsp>(call, "host", optsPromise),
		);
	}

	/**
	 * Host-service tRPC query inside a cloud workspace's sandbox (counterpart
	 * to `workspaceMutation`).
	 */
	workspaceQuery<Rsp>(
		workspaceId: string,
		call: TRPCCall,
		input?: unknown,
		options?: RequestOptions,
	): APIPromise<Rsp> {
		const queryParams: Record<string, string> = {};
		if (input !== undefined) {
			queryParams.input = JSON.stringify({ json: input });
		}
		const optsPromise = this._getWorkspaceAccess(workspaceId).then(
			(access) => ({
				...options,
				method: "get" as const,
				path: `${access.url}/trpc/${call.procedure}`,
				query: queryParams,
				headers: this._gateHeaders(access, options),
			}),
		);
		return this._forgetAccessOnFailure(
			workspaceId,
			this._trackedRequest<Rsp>(call, "host", optsPromise),
		);
	}

	/** A failed gate call may mean a stopped or moved sandbox: the next call wakes it. */
	private _forgetAccessOnFailure<Rsp>(
		workspaceId: string,
		promise: APIPromise<Rsp>,
	): APIPromise<Rsp> {
		promise.then(undefined, () => {
			this._workspaceAccess.delete(workspaceId);
			this._wakeNext.add(workspaceId);
		});
		return promise;
	}

	private _gateHeaders(access: WorkspaceAccess, options?: RequestOptions) {
		return buildHeaders([
			options?.headers,
			{
				"x-api-key": null,
				"x-superset-organization-id": null,
				Authorization: `Bearer ${access.token}`,
			},
		]);
	}

	/**
	 * Issue the request behind a public resource method, unwrap the tRPC
	 * envelope, and report the call to PostHog once the
	 * caller's promise settles: success only after the body parsed and the
	 * envelope unwrapped, failure on transport, HTTP, or parse errors. The
	 * report never sits in the caller's chain, so it cannot delay, fail, or
	 * retry the user's call, and it does not force a parse on callers that
	 * only want `asResponse()`.
	 */
	private _trackedRequest<Rsp>(
		call: TRPCCall,
		target: TelemetryTarget,
		options: PromiseOrValue<FinalRequestOptions>,
	): APIPromise<Rsp> {
		const startedAt = Date.now();
		const responsePromise = this.makeRequest(options, null, undefined);
		let reported = false;
		const report = (success: boolean) => {
			if (reported || !this._telemetryEnabled) return;
			reported = true;
			this._captureMethodCalled(call, target, success, startedAt);
		};
		responsePromise.then(undefined, () => report(false));
		return new APIPromise(this, responsePromise, async (client, props) => {
			try {
				const envelope = await defaultParseResponse<TRPCEnvelope<Rsp>>(
					client,
					props,
				);
				const data = envelope.result.data.json;
				report(true);
				return data;
			} catch (error) {
				report(false);
				throw error;
			}
		});
	}

	private _captureMethodCalled(
		call: TRPCCall,
		target: TelemetryTarget,
		success: boolean,
		startedAt: number,
	): void {
		try {
			const key = resolveTelemetryKey(this.baseURL);
			if (!key) return;
			const { url, init } = buildCaptureRequest({
				key,
				event: buildMethodCalledEvent({
					method: call.method,
					target,
					success,
					durationMs: Date.now() - startedAt,
				}),
				credential: this.apiKey,
				organizationId: this.organizationId,
			});
			this.fetch
				.call(undefined, url, { ...init, signal: AbortSignal.timeout(10_000) })
				.catch(() => {
					// Telemetry is best-effort; never surface failures to the caller.
				});
		} catch {
			// Same: a bug in telemetry must not reach the caller.
		}
	}

	/**
	 * The gate ticket for a cloud workspace, cached per workspace. Concurrent
	 * calls share one mint. Every mint wakes the sandbox: a stopped session
	 * resumes and a running one is extended. The mint itself is not a public
	 * method, so it goes through `post` and is not reported.
	 */
	private async _getWorkspaceAccess(
		workspaceId: string,
	): Promise<WorkspaceAccess> {
		const cached = this._workspaceAccess.get(workspaceId);
		if (cached && cached.staleAt > Date.now()) return cached;
		const inflight = this._workspaceAccessInflight.get(workspaceId);
		if (inflight) return inflight;
		const mint = this._mintWorkspaceAccess(workspaceId).finally(() => {
			this._workspaceAccessInflight.delete(workspaceId);
		});
		this._workspaceAccessInflight.set(workspaceId, mint);
		return mint;
	}

	private async _mintWorkspaceAccess(
		workspaceId: string,
	): Promise<WorkspaceAccess> {
		const mintedAt = Date.now();
		// A ticket for the sandbox's last known address asks the provider
		// nothing; the full wake runs only after a call through that ticket
		// failed, since the sandbox may have stopped or moved.
		const wake = this._wakeNext.delete(workspaceId);
		const envelope = await this.post<
			TRPCEnvelope<{ url: string; token: string; expiresAt: string }>
		>(
			wake
				? "/api/trpc/cloudWorkspace.access"
				: "/api/trpc/cloudWorkspace.hostTicket",
			{
				body: {
					json: wake ? { id: workspaceId, wake: true } : { id: workspaceId },
				},
			},
		);
		const { url, token, expiresAt } = envelope.result.data.json;
		const access: WorkspaceAccess = {
			url,
			token,
			staleAt: Math.min(
				new Date(expiresAt).getTime() - ACCESS_EXPIRY_MARGIN_MS,
				mintedAt + ACCESS_REFRESH_MS,
			),
		};
		this._workspaceAccess.set(workspaceId, access);
		return access;
	}

	private methodRequest<Rsp>(
		method: HTTPMethod,
		path: string,
		opts?: PromiseOrValue<RequestOptions>,
	): APIPromise<Rsp> {
		return this.request(
			Promise.resolve(opts).then((opts) => {
				return { method, path, ...opts };
			}),
		);
	}

	request<Rsp>(
		options: PromiseOrValue<FinalRequestOptions>,
		remainingRetries: number | null = null,
	): APIPromise<Rsp> {
		return new APIPromise(
			this,
			this.makeRequest(options, remainingRetries, undefined),
		);
	}

	private async makeRequest(
		optionsInput: PromiseOrValue<FinalRequestOptions>,
		retriesRemaining: number | null,
		retryOfRequestLogID: string | undefined,
	): Promise<APIResponseProps> {
		const options = await optionsInput;
		const maxRetries = options.maxRetries ?? this.maxRetries;
		if (retriesRemaining == null) {
			retriesRemaining = maxRetries;
		}

		await this.prepareOptions(options);

		const { req, url, timeout } = await this.buildRequest(options, {
			retryCount: maxRetries - retriesRemaining,
		});

		await this.prepareRequest(req, { url, options });

		/** Not an API request ID, just for correlating local log entries. */
		const requestLogID = `log_${((Math.random() * (1 << 24)) | 0).toString(16).padStart(6, "0")}`;
		const retryLogStr =
			retryOfRequestLogID === undefined
				? ""
				: `, retryOf: ${retryOfRequestLogID}`;
		const startTime = Date.now();

		loggerFor(this).debug(
			`[${requestLogID}] sending request`,
			formatRequestDetails({
				retryOfRequestLogID,
				method: options.method,
				url,
				options,
				headers: req.headers,
			}),
		);

		if (options.signal?.aborted) {
			throw new Errors.APIUserAbortError();
		}

		const controller = new AbortController();
		const response = await this.fetchWithTimeout(
			url,
			req,
			timeout,
			controller,
		).catch(castToError);
		const headersTime = Date.now();

		if (response instanceof globalThis.Error) {
			const retryMessage = `retrying, ${retriesRemaining} attempts remaining`;
			if (options.signal?.aborted) {
				throw new Errors.APIUserAbortError();
			}
			// detect native connection timeout errors
			// deno throws "TypeError: error sending request for url (https://example/): client error (Connect): tcp connect error: Operation timed out (os error 60): Operation timed out (os error 60)"
			// undici throws "TypeError: fetch failed" with cause "ConnectTimeoutError: Connect Timeout Error (attempted address: example:443, timeout: 1ms)"
			// others do not provide enough information to distinguish timeouts from other connection errors
			const isTimeout =
				isAbortError(response) ||
				/timed? ?out/i.test(
					String(response) +
						("cause" in response ? String(response.cause) : ""),
				);
			if (retriesRemaining) {
				loggerFor(this).info(
					`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} - ${retryMessage}`,
				);
				loggerFor(this).debug(
					`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} (${retryMessage})`,
					formatRequestDetails({
						retryOfRequestLogID,
						url,
						durationMs: headersTime - startTime,
						message: response.message,
					}),
				);
				return this.retryRequest(
					options,
					retriesRemaining,
					retryOfRequestLogID ?? requestLogID,
				);
			}
			loggerFor(this).info(
				`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} - error; no more retries left`,
			);
			loggerFor(this).debug(
				`[${requestLogID}] connection ${isTimeout ? "timed out" : "failed"} (error; no more retries left)`,
				formatRequestDetails({
					retryOfRequestLogID,
					url,
					durationMs: headersTime - startTime,
					message: response.message,
				}),
			);
			if (isTimeout) {
				throw new Errors.APIConnectionTimeoutError();
			}
			throw new Errors.APIConnectionError({ cause: response });
		}

		const responseInfo = `[${requestLogID}${retryLogStr}] ${req.method} ${url} ${
			response.ok ? "succeeded" : "failed"
		} with status ${response.status} in ${headersTime - startTime}ms`;

		if (!response.ok) {
			const shouldRetry = await this.shouldRetry(response);
			if (retriesRemaining && shouldRetry) {
				const retryMessage = `retrying, ${retriesRemaining} attempts remaining`;

				// We don't need the body of this response.
				await Shims.CancelReadableStream(response.body);
				loggerFor(this).info(`${responseInfo} - ${retryMessage}`);
				loggerFor(this).debug(
					`[${requestLogID}] response error (${retryMessage})`,
					formatRequestDetails({
						retryOfRequestLogID,
						url: response.url,
						status: response.status,
						headers: response.headers,
						durationMs: headersTime - startTime,
					}),
				);
				return this.retryRequest(
					options,
					retriesRemaining,
					retryOfRequestLogID ?? requestLogID,
					response.headers,
				);
			}

			const retryMessage = shouldRetry
				? `error; no more retries left`
				: `error; not retryable`;

			loggerFor(this).info(`${responseInfo} - ${retryMessage}`);

			const errText = await response
				.text()
				.catch((err: any) => castToError(err).message);
			const errJSON = safeJSON(errText) as any;
			const errMessage = errJSON ? undefined : errText;

			loggerFor(this).debug(
				`[${requestLogID}] response error (${retryMessage})`,
				formatRequestDetails({
					retryOfRequestLogID,
					url: response.url,
					status: response.status,
					headers: response.headers,
					message: errMessage,
					durationMs: Date.now() - startTime,
				}),
			);

			const err = this.makeStatusError(
				response.status,
				errJSON,
				errMessage,
				response.headers,
			);
			throw err;
		}

		loggerFor(this).info(responseInfo);
		loggerFor(this).debug(
			`[${requestLogID}] response start`,
			formatRequestDetails({
				retryOfRequestLogID,
				url: response.url,
				status: response.status,
				headers: response.headers,
				durationMs: headersTime - startTime,
			}),
		);

		return {
			response,
			options,
			controller,
			requestLogID,
			retryOfRequestLogID,
			startTime,
		};
	}

	async fetchWithTimeout(
		url: RequestInfo,
		init: RequestInit | undefined,
		ms: number,
		controller: AbortController,
	): Promise<Response> {
		const { signal, method, ...options } = init || {};
		const abort = this._makeAbort(controller);
		if (signal) signal.addEventListener("abort", abort, { once: true });

		const timeout = setTimeout(abort, ms);

		const isReadableBody =
			((globalThis as any).ReadableStream &&
				options.body instanceof (globalThis as any).ReadableStream) ||
			(typeof options.body === "object" &&
				options.body !== null &&
				Symbol.asyncIterator in options.body);

		const fetchOptions: RequestInit = {
			signal: controller.signal as any,
			...(isReadableBody ? { duplex: "half" } : {}),
			method: "GET",
			...options,
		};
		if (method) {
			// Custom methods like 'patch' need to be uppercased
			// See https://github.com/nodejs/undici/issues/2294
			fetchOptions.method = method.toUpperCase();
		}

		try {
			// use undefined this binding; fetch errors if bound to something else in browser/cloudflare
			return await this.fetch.call(undefined, url, fetchOptions);
		} finally {
			clearTimeout(timeout);
		}
	}

	private async shouldRetry(response: Response): Promise<boolean> {
		// Note this is not a standard header.
		const shouldRetryHeader = response.headers.get("x-should-retry");

		// If the server explicitly says whether or not to retry, obey.
		if (shouldRetryHeader === "true") return true;
		if (shouldRetryHeader === "false") return false;

		// Retry on request timeouts.
		if (response.status === 408) return true;

		// Retry on lock timeouts.
		if (response.status === 409) return true;

		// Retry on rate limits.
		if (response.status === 429) return true;

		// Retry internal errors.
		if (response.status >= 500) return true;

		return false;
	}

	private async retryRequest(
		options: FinalRequestOptions,
		retriesRemaining: number,
		requestLogID: string,
		responseHeaders?: Headers | undefined,
	): Promise<APIResponseProps> {
		let timeoutMillis: number | undefined;

		// Note the `retry-after-ms` header may not be standard, but is a good idea and we'd like proactive support for it.
		const retryAfterMillisHeader = responseHeaders?.get("retry-after-ms");
		if (retryAfterMillisHeader) {
			const timeoutMs = parseFloat(retryAfterMillisHeader);
			if (!Number.isNaN(timeoutMs)) {
				timeoutMillis = timeoutMs;
			}
		}

		// About the Retry-After header: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Retry-After
		const retryAfterHeader = responseHeaders?.get("retry-after");
		if (retryAfterHeader && !timeoutMillis) {
			const timeoutSeconds = parseFloat(retryAfterHeader);
			if (!Number.isNaN(timeoutSeconds)) {
				timeoutMillis = timeoutSeconds * 1000;
			} else {
				timeoutMillis = Date.parse(retryAfterHeader) - Date.now();
			}
		}

		// If the API asks us to wait a certain amount of time, just do what it
		// says, but otherwise calculate a default
		if (timeoutMillis === undefined) {
			const maxRetries = options.maxRetries ?? this.maxRetries;
			timeoutMillis = this.calculateDefaultRetryTimeoutMillis(
				retriesRemaining,
				maxRetries,
			);
		}
		await sleep(timeoutMillis);

		return this.makeRequest(options, retriesRemaining - 1, requestLogID);
	}

	private calculateDefaultRetryTimeoutMillis(
		retriesRemaining: number,
		maxRetries: number,
	): number {
		const initialRetryDelay = 0.5;
		const maxRetryDelay = 8.0;

		const numRetries = maxRetries - retriesRemaining;

		// Apply exponential backoff, but not more than the max.
		const sleepSeconds = Math.min(
			initialRetryDelay * 2 ** numRetries,
			maxRetryDelay,
		);

		// Apply some jitter, take up to at most 25 percent of the retry time.
		const jitter = 1 - Math.random() * 0.25;

		return sleepSeconds * jitter * 1000;
	}

	async buildRequest(
		inputOptions: FinalRequestOptions,
		{ retryCount = 0 }: { retryCount?: number } = {},
	): Promise<{ req: FinalizedRequestInit; url: string; timeout: number }> {
		const options = { ...inputOptions };
		const { method, path, query, defaultBaseURL } = options;

		const url = this.buildURL(
			path!,
			query as Record<string, unknown>,
			defaultBaseURL,
		);
		if ("timeout" in options)
			validatePositiveInteger("timeout", options.timeout);
		options.timeout = options.timeout ?? this.timeout;
		const { bodyHeaders, body } = this.buildBody({ options });
		const reqHeaders = await this.buildHeaders({
			options: inputOptions,
			method,
			bodyHeaders,
			retryCount,
		});

		const req: FinalizedRequestInit = {
			method,
			headers: reqHeaders,
			...(options.signal && { signal: options.signal }),
			...((globalThis as any).ReadableStream &&
				body instanceof (globalThis as any).ReadableStream && {
					duplex: "half",
				}),
			...(body && { body }),
			...((this.fetchOptions as any) ?? {}),
			...((options.fetchOptions as any) ?? {}),
		};

		return { req, url, timeout: options.timeout };
	}

	private async buildHeaders({
		options,
		method,
		bodyHeaders,
		retryCount,
	}: {
		options: FinalRequestOptions;
		method: HTTPMethod;
		bodyHeaders: HeadersLike;
		retryCount: number;
	}): Promise<Headers> {
		const idempotencyHeaders: HeadersLike = {};
		if (this.idempotencyHeader && method !== "get") {
			if (!options.idempotencyKey)
				options.idempotencyKey = this.defaultIdempotencyKey();
			idempotencyHeaders[this.idempotencyHeader] = options.idempotencyKey;
		}

		const headers = buildHeaders([
			idempotencyHeaders,
			{
				Accept: "application/json",
				"User-Agent": this.getUserAgent(),
				"x-superset-client": `sdk/${VERSION}`,
				"X-Stainless-Retry-Count": String(retryCount),
				...(options.timeout
					? {
							"X-Stainless-Timeout": String(Math.trunc(options.timeout / 1000)),
						}
					: {}),
				...getPlatformHeaders(),
			},
			await this.authHeaders(options),
			this._options.defaultHeaders,
			bodyHeaders,
			options.headers,
		]);

		this.validateHeaders(headers);

		return headers.values;
	}

	private _makeAbort(controller: AbortController) {
		// note: we can't just inline this method inside `fetchWithTimeout()` because then the closure
		//       would capture all request options, and cause a memory leak.
		return () => controller.abort();
	}

	private buildBody({
		options: { body, headers: rawHeaders },
	}: {
		options: FinalRequestOptions;
	}): {
		bodyHeaders: HeadersLike;
		body: BodyInit | undefined;
	} {
		if (!body) {
			return { bodyHeaders: undefined, body: undefined };
		}
		const headers = buildHeaders([rawHeaders]);
		if (
			// Pass raw type verbatim
			ArrayBuffer.isView(body) ||
			body instanceof ArrayBuffer ||
			body instanceof DataView ||
			(typeof body === "string" &&
				// Preserve legacy string encoding behavior for now
				headers.values.has("content-type")) ||
			// `Blob` is superset of `File`
			((globalThis as any).Blob && body instanceof (globalThis as any).Blob) ||
			// `FormData` -> `multipart/form-data`
			body instanceof FormData ||
			// `URLSearchParams` -> `application/x-www-form-urlencoded`
			body instanceof URLSearchParams ||
			// Send chunked stream (each chunk has own `length`)
			((globalThis as any).ReadableStream &&
				body instanceof (globalThis as any).ReadableStream)
		) {
			return { bodyHeaders: undefined, body: body as BodyInit };
		} else if (
			typeof body === "object" &&
			(Symbol.asyncIterator in body ||
				(Symbol.iterator in body &&
					"next" in body &&
					typeof body.next === "function"))
		) {
			return {
				bodyHeaders: undefined,
				body: Shims.ReadableStreamFrom(body as AsyncIterable<Uint8Array>),
			};
		} else if (
			typeof body === "object" &&
			headers.values.get("content-type") === "application/x-www-form-urlencoded"
		) {
			return {
				bodyHeaders: { "content-type": "application/x-www-form-urlencoded" },
				body: this.stringifyQuery(body),
			};
		} else {
			return this.#encoder({ body, headers });
		}
	}

	static Superset = this;
	static DEFAULT_TIMEOUT = 60000; // 1 minute

	static SupersetError = Errors.SupersetError;
	static APIError = Errors.APIError;
	static APIConnectionError = Errors.APIConnectionError;
	static APIConnectionTimeoutError = Errors.APIConnectionTimeoutError;
	static APIUserAbortError = Errors.APIUserAbortError;
	static NotFoundError = Errors.NotFoundError;
	static ConflictError = Errors.ConflictError;
	static RateLimitError = Errors.RateLimitError;
	static BadRequestError = Errors.BadRequestError;
	static AuthenticationError = Errors.AuthenticationError;
	static InternalServerError = Errors.InternalServerError;
	static PermissionDeniedError = Errors.PermissionDeniedError;
	static UnprocessableEntityError = Errors.UnprocessableEntityError;

	static toFile = Uploads.toFile;

	/** Tasks: create, list (with filters), retrieve, update, delete; nested `tasks.statuses.list`. */
	tasks: API.Tasks = new API.Tasks(this);
	/** Cloud workspaces: list, retrieve, create, update, delete. */
	workspaces: API.Workspaces = new API.Workspaces(this);
	/** Agents launched inside a cloud workspace: create. */
	agents: API.Agents = new API.Agents(this);
	/** Terminals (PTY sessions inside a cloud workspace): create, list, send (follow-up), read, close. */
	terminals: API.Terminals = new API.Terminals(this);
	/** Active-organization config: nested `organization.members.list`. */
	organization: API.Organization = new API.Organization(this);
}

Superset.Tasks = Tasks;
Superset.Workspaces = Workspaces;
Superset.Agents = Agents;
Superset.Terminals = Terminals;
Superset.Organization = Organization;

export declare namespace Superset {
	export type RequestOptions = Opts.RequestOptions;

	export {
		Tasks,
		Task,
		TaskListItem,
		TaskListResponse,
		TaskCreateParams,
		TaskUpdateParams,
		TaskListParams,
		TaskStatuses,
		TaskStatus,
		TaskStatusListResponse,
	};

	export {
		Organization,
		Members,
		Member,
		MemberListResponse,
		MemberListParams,
		OrganizationRole,
	};

	export {
		Workspaces,
		CloudWorkspace,
		CloudWorkspaceStatus,
		WorkspaceListResponse,
		WorkspaceListParams,
		WorkspaceCreateParams,
		WorkspaceUpdateParams,
		WorkspaceDeleteResult,
	};

	export { Agents, AgentCreateParams, AgentCreateResult };

	export {
		Terminals,
		TerminalCreateParams,
		TerminalCreateResult,
		TerminalListParams,
		TerminalListResult,
		TerminalSummary,
		TerminalSendParams,
		TerminalSendResult,
		TerminalReadParams,
		TerminalReadResult,
		TerminalCloseParams,
		TerminalCloseResult,
	};
}
