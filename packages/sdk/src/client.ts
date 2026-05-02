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
import type { APIResponseProps } from "./internal/parse";
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
	AgentConfig,
	Automation,
	AutomationCreateParams,
	AutomationListResponse,
	AutomationLogsParams,
	AutomationLogsResponse,
	AutomationRun,
	AutomationRunDispatched,
	Automations,
	AutomationSummary,
	AutomationUpdateParams,
} from "./resources/automations";
import { Host, HostListResponse, Hosts } from "./resources/hosts";
import * as API from "./resources/index";
import { Project, ProjectListResponse, Projects } from "./resources/projects";
import {
	Task,
	TaskCreateParams,
	TaskListItem,
	TaskListParams,
	TaskListResponse,
	Tasks,
	TaskUpdateParams,
} from "./resources/tasks";
import {
	CreatedWorkspace,
	HostWorkspace,
	Workspace,
	WorkspaceAgentSpawn,
	WorkspaceCreateParams,
	WorkspaceDeleteResult,
	WorkspaceListParams,
	WorkspaceListResponse,
	Workspaces,
} from "./resources/workspaces";
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
	 * which is most resources (tasks, workspaces, projects, hosts, …).
	 */
	organizationId?: string | undefined;

	/**
	 * Override the default base URL for the API, e.g., "https://api.example.com/v2/"
	 *
	 * Defaults to process.env['SUPERSET_BASE_URL'].
	 */
	baseURL?: string | null | undefined;

	/**
	 * Relay base URL for host-routed operations (e.g. workspace create/delete,
	 * which physically run on the developer's machine via the relay tunnel).
	 *
	 * Defaults to process.env['SUPERSET_RELAY_URL'] or `https://relay.superset.sh`.
	 */
	relayURL?: string | null | undefined;

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

/**
 * API Client for interfacing with the Superset API.
 */
export class Superset {
	apiKey: string;
	organizationId: string | null;
	relayURL: string;

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
	private _jwtCache: { token: string; expiresAt: number } | null = null;
	private _jwtInflight: Promise<string> | null = null;

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
		relayURL = readEnv("SUPERSET_RELAY_URL"),
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
		this.relayURL = relayURL || "https://relay.superset.sh";
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
			relayURL: this.relayURL,
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
		procedurePath: string,
		input?: unknown,
		options?: RequestOptions,
	): APIPromise<Rsp> {
		return this.post<TRPCEnvelope<Rsp>>(`/api/trpc/${procedurePath}`, {
			body: { json: input ?? null },
			...options,
		})._thenUnwrap((r) => r.result.data.json);
	}

	/**
	 * Invoke a tRPC query procedure (e.g. `task.list`). Encodes input as a
	 * `?input=<json>` query param when provided, and unwraps the response.
	 */
	query<Rsp>(
		procedurePath: string,
		input?: unknown,
		options?: RequestOptions,
	): APIPromise<Rsp> {
		const queryParams: Record<string, string> = {};
		if (input !== undefined) {
			queryParams.input = JSON.stringify({ json: input });
		}
		return this.get<TRPCEnvelope<Rsp>>(`/api/trpc/${procedurePath}`, {
			query: queryParams,
			...options,
		})._thenUnwrap((r) => r.result.data.json);
	}

	/**
	 * Invoke a host-service tRPC mutation, routed through the relay tunnel to
	 * the developer's machine identified by `hostId`. Used for operations that
	 * physically touch the host's filesystem (workspace create/delete, etc).
	 *
	 * The relay only accepts JWT auth — this method lazily exchanges the SDK's
	 * API key for a short-lived JWT and caches it.
	 */
	hostMutation<Rsp>(
		hostId: string,
		procedurePath: string,
		input?: unknown,
		options?: RequestOptions,
	): APIPromise<Rsp> {
		if (!this.organizationId) {
			throw new Errors.SupersetError(
				"organizationId is required for host-routed calls. Set SUPERSET_ORGANIZATION_ID or pass `organizationId` to the constructor.",
			);
		}
		const routingKey = `${this.organizationId}:${hostId}`;
		const url = `${this.relayURL}/hosts/${routingKey}/trpc/${procedurePath}`;
		const optsPromise = this._getJwt().then((jwt) => ({
			// Caller options first (timeout, retries, signal, etc.) — body and
			// auth headers are then forced so per-call options can't strip the
			// JWT or replace the tRPC envelope.
			...options,
			body: { json: input ?? null },
			headers: buildHeaders([
				options?.headers,
				// Drop API-key auth (relay only verifies JWTs) and assert the JWT.
				{ "x-api-key": null, Authorization: `Bearer ${jwt}` },
			]),
		}));
		return this.post<TRPCEnvelope<Rsp>>(url, optsPromise)._thenUnwrap(
			(r) => r.result.data.json,
		);
	}

	/**
	 * Host-service tRPC query (counterpart to `hostMutation`).
	 */
	hostQuery<Rsp>(
		hostId: string,
		procedurePath: string,
		input?: unknown,
		options?: RequestOptions,
	): APIPromise<Rsp> {
		if (!this.organizationId) {
			throw new Errors.SupersetError(
				"organizationId is required for host-routed calls. Set SUPERSET_ORGANIZATION_ID or pass `organizationId` to the constructor.",
			);
		}
		const routingKey = `${this.organizationId}:${hostId}`;
		const queryParams: Record<string, string> = {};
		if (input !== undefined) {
			queryParams.input = JSON.stringify({ json: input });
		}
		const url = `${this.relayURL}/hosts/${routingKey}/trpc/${procedurePath}`;
		const optsPromise = this._getJwt().then((jwt) => ({
			...options,
			query: queryParams,
			headers: buildHeaders([
				options?.headers,
				{ "x-api-key": null, Authorization: `Bearer ${jwt}` },
			]),
		}));
		return this.get<TRPCEnvelope<Rsp>>(url, optsPromise)._thenUnwrap(
			(r) => r.result.data.json,
		);
	}

	/**
	 * Exchange the API key for a short-lived JWT (1h TTL on the server) and
	 * cache it in memory. Refreshed 5 minutes before expiry to handle clock
	 * skew. Concurrent host calls share a single in-flight exchange so we
	 * don't fan out N token requests on a cold cache.
	 */
	private async _getJwt(): Promise<string> {
		const now = Date.now();
		if (this._jwtCache && this._jwtCache.expiresAt - 5 * 60_000 > now) {
			return this._jwtCache.token;
		}
		if (this._jwtInflight) return this._jwtInflight;
		this._jwtInflight = this._fetchJwt().finally(() => {
			this._jwtInflight = null;
		});
		return this._jwtInflight;
	}

	private async _fetchJwt(): Promise<string> {
		const headers: Record<string, string> =
			this.apiKey.startsWith("sk_live_") || this.apiKey.startsWith("sk_test_")
				? { "x-api-key": this.apiKey }
				: { Authorization: `Bearer ${this.apiKey}` };
		const res = await this.fetch.call(
			undefined,
			`${this.baseURL}/api/auth/token`,
			{
				method: "GET",
				headers,
			},
		);
		if (!res.ok) {
			throw new Errors.SupersetError(
				`Failed to exchange API key for JWT (HTTP ${res.status}). The API key may be invalid or revoked.`,
			);
		}
		const body = (await res.json()) as { token?: string };
		if (!body.token) {
			throw new Errors.SupersetError("Auth token endpoint returned no token");
		}
		// Server issues 1h JWTs; cache for 55 minutes to be safe.
		this._jwtCache = {
			token: body.token,
			expiresAt: Date.now() + 55 * 60_000,
		};
		return body.token;
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

	/** Tasks: create, list (with filters), retrieve, update, delete. */
	tasks: API.Tasks = new API.Tasks(this);
	/** Workspaces (cloud records): list, delete. */
	workspaces: API.Workspaces = new API.Workspaces(this);
	/** Projects: list. */
	projects: API.Projects = new API.Projects(this);
	/** Hosts (developer machines): list. */
	hosts: API.Hosts = new API.Hosts(this);
	/** Recurring automations: full CRUD plus run/pause/resume/logs/prompt. */
	automations: API.Automations = new API.Automations(this);
}

Superset.Tasks = Tasks;
Superset.Workspaces = Workspaces;
Superset.Projects = Projects;
Superset.Hosts = Hosts;
Superset.Automations = Automations;

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
	};

	export {
		Workspaces,
		Workspace,
		HostWorkspace,
		CreatedWorkspace,
		WorkspaceAgentSpawn,
		WorkspaceListResponse,
		WorkspaceListParams,
		WorkspaceCreateParams,
		WorkspaceDeleteResult,
	};

	export { Projects, Project, ProjectListResponse };

	export { Hosts, Host, HostListResponse };

	export {
		Automations,
		Automation,
		AutomationSummary,
		AutomationListResponse,
		AutomationCreateParams,
		AutomationUpdateParams,
		AutomationRun,
		AutomationRunDispatched,
		AutomationLogsParams,
		AutomationLogsResponse,
		AgentConfig,
	};
}
