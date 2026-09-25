import { getPlatformHeaders } from "../internal/detect-platform";
import { readEnv } from "../internal/utils/env";
import { VERSION } from "../version";

/**
 * Usage telemetry, mirroring the CLI's `cli_command_invoked`: one
 * `sdk_method_called` event per public resource call, sent best-effort to
 * `analytics.captureEvent` after the call settles. The event and property
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
