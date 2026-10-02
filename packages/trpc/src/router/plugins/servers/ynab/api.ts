import type { ToolResult } from "./types";

const BASE = "https://api.ynab.com/v1";

export interface YnabRequest {
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	query?: Record<string, unknown>;
	body?: unknown;
}

function safePath(path: string): string {
	return path
		.split("/")
		.map((segment) => {
			if (segment === "." || segment === "..") {
				throw new Error(`invalid YNAB path segment "${segment}"`);
			}
			return encodeURIComponent(segment);
		})
		.join("/");
}

export async function ynab<T = Record<string, unknown>>(
	token: string,
	path: string,
	request: YnabRequest = {},
): Promise<T> {
	const url = new URL(`${BASE}${safePath(path)}`);
	for (const [key, value] of Object.entries(request.query ?? {})) {
		if (value === undefined || value === null || value === "") continue;
		url.searchParams.set(key, String(value));
	}

	const response = await fetch(url, {
		method: request.method ?? "GET",
		headers: {
			authorization: `Bearer ${token}`,
			...(request.body === undefined
				? {}
				: { "content-type": "application/json" }),
		},
		...(request.body === undefined
			? {}
			: { body: JSON.stringify(request.body) }),
	});

	if (response.status === 204) return {} as T;

	const payload = (await response.json().catch(() => null)) as {
		data?: T;
		error?: { name?: string; detail?: string };
	} | null;

	if (response.status === 429) {
		throw new Error(
			"YNAB rate limit reached: a token allows 200 requests per hour on a rolling window. Wait before retrying rather than repeating the call.",
		);
	}

	if (!response.ok) {
		const detail =
			payload?.error?.detail ??
			payload?.error?.name ??
			`${response.status} ${response.statusText}`;
		throw new Error(`YNAB API error: ${detail}`);
	}
	return (payload?.data ?? ({} as T)) as T;
}

export function text(value: string): ToolResult {
	return { content: [{ type: "text", text: value }] };
}

export function failure(value: string): ToolResult {
	return { ...text(value), isError: true };
}

export function requireString(
	args: Record<string, unknown>,
	field: string,
): string {
	const value = args[field];
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`${field} is required`);
	}
	return value.trim();
}

export function optionalString(
	args: Record<string, unknown>,
	field: string,
): string | undefined {
	const value = args[field];
	if (value === undefined || value === null || value === "") return undefined;
	return String(value).trim();
}

export function clearable(
	args: Record<string, unknown>,
	field: string,
): string | null | undefined {
	if (!Object.hasOwn(args, field)) return undefined;
	const value = args[field];
	if (value === null) return null;
	const trimmed = String(value).trim();
	return trimmed === "" ? null : trimmed;
}

export function optionalBoolean(
	args: Record<string, unknown>,
	field: string,
): boolean | undefined {
	const value = args[field];
	if (value === undefined || value === null) return undefined;
	if (typeof value === "boolean") return value;
	if (value === "true") return true;
	if (value === "false") return false;
	throw new Error(`${field} must be a boolean`);
}

export function requireNumber(
	args: Record<string, unknown>,
	field: string,
): number {
	const value = args[field];
	const parsed = typeof value === "number" ? value : Number(value);
	if (value === undefined || value === null || !Number.isFinite(parsed)) {
		throw new Error(`${field} is required and must be a number`);
	}
	return parsed;
}

export function optionalNumber(
	args: Record<string, unknown>,
	field: string,
): number | undefined {
	const value = args[field];
	if (value === undefined || value === null || value === "") return undefined;
	return requireNumber(args, field);
}

export function budgetId(args: Record<string, unknown>): string {
	return optionalString(args, "budget_id") ?? "last-used";
}

const MONTH_PATTERN = /^\d{4}-\d{2}(-\d{2})?$/;

export function monthArg(args: Record<string, unknown>): string {
	const raw = optionalString(args, "month");
	if (raw === undefined || raw === "current") return "current";
	if (!MONTH_PATTERN.test(raw)) {
		throw new Error('month must be "current", YYYY-MM, or YYYY-MM-DD');
	}
	return `${raw.slice(0, 7)}-01`;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function dateArg(
	args: Record<string, unknown>,
	field: string,
	required: true,
): string;
export function dateArg(
	args: Record<string, unknown>,
	field: string,
	required?: false,
): string | undefined;
export function dateArg(
	args: Record<string, unknown>,
	field: string,
	required = false,
): string | undefined {
	const raw = required
		? requireString(args, field)
		: optionalString(args, field);
	if (raw === undefined) return undefined;
	if (!DATE_PATTERN.test(raw)) {
		throw new Error(`${field} must be an ISO date, e.g. 2026-09-28`);
	}
	return raw;
}

export function toMilliunits(amount: number): number {
	return Math.round(amount * 1000);
}

export function money(
	value: number | null | undefined,
	formatted?: string | null,
): string {
	if (formatted) return formatted;
	if (value === undefined || value === null) return "n/a";
	return (value / 1000).toFixed(3).replace(/(\.\d\d)0$/, "$1");
}

export function signed(value: number, formatted?: string | null): string {
	const amount = money(value, formatted);
	return value > 0 ? `+${amount}` : amount;
}
