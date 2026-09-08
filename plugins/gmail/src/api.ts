import type { ToolResult } from "./types";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailRequest {
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	query?: Record<string, unknown>;
	body?: unknown;
}

export async function gmail<T = Record<string, unknown>>(
	accessToken: string,
	path: string,
	request: GmailRequest = {},
): Promise<T> {
	const url = new URL(`${BASE}${path}`);
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
		error?: { message?: string; status?: string };
	} | null;

	if (!response.ok) {
		const detail =
			payload?.error?.message ?? `${response.status} ${response.statusText}`;
		throw new Error(`Gmail API error: ${detail}`);
	}
	return (payload ?? {}) as T;
}

export function text(value: string): ToolResult {
	return { content: [{ type: "text", text: value }] };
}

export function failure(value: string): ToolResult {
	return { ...text(value), isError: true };
}

export function stringList(value: unknown, field: string): string[] {
	if (value === undefined || value === null) return [];
	if (typeof value === "string") return value.trim() ? [value.trim()] : [];
	if (!Array.isArray(value)) {
		throw new Error(`${field} must be a string or an array of strings`);
	}
	return value.map((entry) => String(entry).trim()).filter(Boolean);
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

export function optionalNumber(
	args: Record<string, unknown>,
	field: string,
): number | undefined {
	const value = args[field];
	if (value === undefined || value === null) return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) throw new Error(`${field} must be a number`);
	return parsed;
}
