/**
 * Shared logic for per-tool renderers. Pure functions, React-free.
 */

import type { ToolPart, ToolState } from "@superset/chat/shared";
import type { BasicToolStatus } from "./BasicTool";

export function statusFromToolState(state: ToolState): BasicToolStatus {
	switch (state.kind) {
		case "input-streaming":
			return "pending";
		case "running":
			return "running";
		case "completed":
			return "completed";
		case "error":
			return "error";
	}
}

export function inputAsRecord(
	state: ToolState,
): Record<string, unknown> | undefined {
	if (state.input && typeof state.input === "object" && !Array.isArray(state.input)) {
		return state.input as Record<string, unknown>;
	}
	return undefined;
}

/** Lossy string field lookup across a list of candidate keys. */
export function pickString(
	input: Record<string, unknown> | undefined,
	keys: readonly string[],
): string | undefined {
	if (!input) return undefined;
	for (const key of keys) {
		const v = input[key];
		if (typeof v === "string" && v.length > 0) return v;
	}
	return undefined;
}

/** Number from a string/number field, else fallback. */
export function pickNumber(
	input: Record<string, unknown> | undefined,
	keys: readonly string[],
): number | undefined {
	if (!input) return undefined;
	for (const key of keys) {
		const v = input[key];
		if (typeof v === "number" && Number.isFinite(v)) return v;
		if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v))
			return Number.parseFloat(v);
	}
	return undefined;
}

/**
 * Turn an arbitrary input object into up to N "k=v" trigger args, used
 * by GenericTool when no tool-specific handler claimed it.
 */
export function argsFromInput(
	input: Record<string, unknown> | undefined,
	skipKeys: ReadonlySet<string> = new Set(),
	limit = 3,
): string[] {
	if (!input) return [];
	const out: string[] = [];
	for (const [key, value] of Object.entries(input)) {
		if (skipKeys.has(key)) continue;
		if (
			typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "boolean"
		) {
			out.push(`${key}=${value}`);
			if (out.length >= limit) break;
		}
	}
	return out;
}

/** Decide whether to route a tool part to the ToolErrorCard fallback. */
export function isToolError(part: ToolPart): boolean {
	return part.state.kind === "error";
}

/** Extract shell stdout from various output shapes. */
export function extractShellOutput(output: unknown): string {
	if (typeof output === "string") return output;
	if (output && typeof output === "object") {
		const o = output as Record<string, unknown>;
		if (typeof o.stdout === "string") return o.stdout;
		if (typeof o.output === "string") return o.output;
		if (typeof o.text === "string") return o.text;
	}
	return "";
}

/** Strip ANSI escape sequences (cheap common subset — covers SGR). */
export function stripAnsi(input: string): string {
	// eslint-disable-next-line no-control-regex
	return input.replace(/\u001b\[[0-9;]*[a-zA-Z]/g, "");
}
