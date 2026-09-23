import { getPlatformHeaders } from "../internal/detect-platform";
import { fromBase64 } from "../internal/utils/base64";
import { readEnv } from "../internal/utils/env";
import { uuid4 } from "../internal/utils/uuid";
import { VERSION } from "../version";

/**
 * Usage telemetry, mirroring the CLI's `cli_command_invoked`: one
 * `sdk_method_called` event per public resource call, sent best-effort
 * straight to PostHog after the call settles. The event and property
 * names are read by dashboard tiles — treat them as a contract.
 *
 * Opt out with `SUPERSET_TELEMETRY=0`.
 */
export const TELEMETRY_EVENT = "sdk_method_called";
export const TELEMETRY_OPT_OUT_ENV = "SUPERSET_TELEMETRY";

/** Which side of the API a public method talks to. */
export type TelemetryTarget = "cloud" | "host";

export type TelemetryRuntime =
	| "node"
	| "bun"
	| "deno"
	| "edge"
	| "browser"
	| "unknown";

/**
 * Names a public SDK method and the tRPC procedure that backs it. `method`
 * is what the caller typed (`tasks.list`, `workspaces.create`) and is the
 * only name telemetry reports; `procedure` is the wire path and differs
 * between cloud and host routers.
 */
export interface TRPCCall {
	method: string;
	procedure: string;
}

export interface MethodCalledEvent {
	source: "sdk";
	event: typeof TELEMETRY_EVENT;
	properties: {
		method: string;
		sdk_version: string;
		sdk_lang: "js";
		runtime: TelemetryRuntime;
		target: TelemetryTarget;
		success: boolean;
		duration_ms: number;
	};
}

export function isTelemetryEnabled(): boolean {
	const value = readEnv(TELEMETRY_OPT_OUT_ENV)?.toLowerCase();
	return value !== "0" && value !== "false";
}

let _runtime: TelemetryRuntime | undefined;

export function detectRuntime(): TelemetryRuntime {
	if (_runtime) return _runtime;
	const versions = (globalThis as any).process?.versions;
	if (versions?.bun) {
		_runtime = "bun";
		return _runtime;
	}
	const stainlessRuntime = getPlatformHeaders()["X-Stainless-Runtime"];
	_runtime = stainlessRuntime.startsWith("browser:")
		? "browser"
		: (stainlessRuntime as Exclude<TelemetryRuntime, "bun" | "browser">);
	return _runtime;
}

export function buildMethodCalledEvent(input: {
	method: string;
	target: TelemetryTarget;
	success: boolean;
	durationMs: number;
}): MethodCalledEvent {
	return {
		source: "sdk",
		event: TELEMETRY_EVENT,
		properties: {
			method: input.method,
			sdk_version: VERSION,
			sdk_lang: "js",
			runtime: detectRuntime(),
			target: input.target,
			success: input.success,
			duration_ms: Math.max(0, Math.round(input.durationMs)),
		},
	};
}

const POSTHOG_CAPTURE_URL = "https://us.i.posthog.com/i/v0/e/";
const PRODUCTION_BASE_URL = "https://api.superset.sh";
/** Production's public ingest key: write-only, and already shipped in the web bundle. */
const PRODUCTION_POSTHOG_KEY = "phc_relI1yg6V5m77qT7U3JctNKULVQLh3LkGFb3PCjeQ0P";

/** Nothing is sent for a client pointed anywhere but production unless `SUPERSET_POSTHOG_KEY` names a project. */
export function resolveTelemetryKey(baseURL: string): string | null {
	const override = readEnv("SUPERSET_POSTHOG_KEY")?.trim();
	if (override) return override;
	return baseURL.replace(/\/+$/, "") === PRODUCTION_BASE_URL
		? PRODUCTION_POSTHOG_KEY
		: null;
}

let _anonymousId: string | undefined;

/**
 * A session token names its user; an API key belongs to an organization, not
 * a person, so its calls are reported under an anonymous id for this process.
 */
function tokenUserId(credential: string): string | null {
	const payload = credential.split(".")[1];
	if (!payload) return null;
	try {
		const claims = JSON.parse(
			new TextDecoder().decode(
				fromBase64(payload.replace(/-/g, "+").replace(/_/g, "/")),
			),
		) as { sub?: unknown };
		return typeof claims.sub === "string" && claims.sub ? claims.sub : null;
	} catch {
		return null;
	}
}

export function buildCaptureRequest(input: {
	key: string;
	event: MethodCalledEvent;
	credential: string;
	organizationId: string | null;
}): { url: string; init: RequestInit } {
	const userId = tokenUserId(input.credential);
	_anonymousId ??= uuid4();
	return {
		url: POSTHOG_CAPTURE_URL,
		init: {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				api_key: input.key,
				event: input.event.event,
				distinct_id: userId ?? _anonymousId,
				properties: {
					...input.event.properties,
					source: input.event.source,
					...(input.organizationId
						? {
								active_organization_id: input.organizationId,
								$groups: { organization: input.organizationId },
							}
						: {}),
				},
			}),
		},
	};
}
