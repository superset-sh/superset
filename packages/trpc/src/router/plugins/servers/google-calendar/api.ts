import type { ToolResult } from "./types";

const BASE = "https://www.googleapis.com/calendar/v3";

export interface CalendarRequest {
	method?: "GET" | "POST" | "PATCH" | "DELETE";
	query?: Record<string, unknown>;
	body?: unknown;
}

export async function calendar<T = Record<string, unknown>>(
	accessToken: string,
	segments: string[],
	request: CalendarRequest = {},
): Promise<T> {
	for (const segment of segments) {
		if (segment === "." || segment === "..") {
			throw new Error(`invalid Google Calendar path segment "${segment}"`);
		}
	}
	const url = new URL(
		`${BASE}/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`,
	);
	for (const [key, value] of Object.entries(request.query ?? {})) {
		if (value === undefined || value === null || value === "") continue;
		if (Array.isArray(value)) {
			for (const item of value) url.searchParams.append(key, String(item));
		} else {
			url.searchParams.set(key, String(value));
		}
	}

	const response = await fetch(url, {
		method: request.method ?? "GET",
		headers: {
			authorization: `Bearer ${accessToken}`,
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
		error?: { message?: string };
	} | null;

	if (!response.ok) {
		const detail =
			payload?.error?.message ?? `${response.status} ${response.statusText}`;
		if (response.status === 403 && /insufficient/i.test(detail)) {
			throw new Error(
				`Google Calendar API error: ${detail.replace(/\.$/, "")}. This Google connection was made before Calendar write access was added; reconnect Google to grant it.`,
			);
		}
		throw new Error(`Google Calendar API error: ${detail}`);
	}
	return (payload ?? {}) as T;
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
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string") throw new Error(`${field} must be a string`);
	return value.trim() || undefined;
}

export function calendarId(args: Record<string, unknown>): string {
	return optionalString(args, "calendarId") ?? "primary";
}

export function stringList(value: unknown, field: string): string[] {
	if (value === undefined || value === null) return [];
	if (typeof value === "string") return value.trim() ? [value.trim()] : [];
	if (!Array.isArray(value)) {
		throw new Error(`${field} must be a string or an array of strings`);
	}
	return value.map((entry) => String(entry).trim()).filter(Boolean);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;
const OFFSET = /(Z|[+-]\d{2}:\d{2})$/;

export function isDateTime(value: unknown): boolean {
	return typeof value === "string" && DATE_TIME.test(value);
}

export type EventTime =
	| { date: string }
	| { dateTime: string; timeZone?: string };

export function eventTime(
	value: string,
	field: string,
	timeZone: string | undefined,
): EventTime {
	if (DATE.test(value)) return { date: value };
	if (!DATE_TIME.test(value)) {
		throw new Error(
			`${field} must be a date (2026-10-07) for an all-day event or a date-time (2026-10-07T15:00:00)`,
		);
	}
	if (OFFSET.test(value)) {
		return timeZone ? { dateTime: value, timeZone } : { dateTime: value };
	}
	if (!timeZone) {
		throw new Error(
			`${field} has no UTC offset, so it needs a timeZone such as America/New_York`,
		);
	}
	return { dateTime: value, timeZone };
}

export function instant(value: string, field: string): string {
	if (DATE_TIME.test(value) && OFFSET.test(value)) return value;
	throw new Error(
		`${field} must be a date-time with a UTC offset, e.g. 2026-10-07T09:00:00-07:00`,
	);
}

export interface Interval {
	start: number;
	end: number;
}

export function freeSlots(
	busy: Interval[],
	range: Interval,
	minimumMs: number,
): Interval[] {
	const sorted = busy
		.map((block) => ({
			start: Math.max(block.start, range.start),
			end: Math.min(block.end, range.end),
		}))
		.filter((block) => block.end > block.start)
		.sort((a, b) => a.start - b.start);

	const slots: Interval[] = [];
	let cursor = range.start;
	for (const block of sorted) {
		if (block.start - cursor >= minimumMs) {
			slots.push({ start: cursor, end: block.start });
		}
		cursor = Math.max(cursor, block.end);
	}
	if (range.end - cursor >= minimumMs) {
		slots.push({ start: cursor, end: range.end });
	}
	return slots;
}
