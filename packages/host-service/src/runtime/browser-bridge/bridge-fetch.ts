import { TRPCError } from "@trpc/server";
import type { BrowserBridgeConfig } from "../../types";

export interface BridgeResponse {
	ok: boolean;
	status: number;
	body: unknown;
}

/** One authenticated loopback call to the desktop bridge. */
export async function bridgeFetch(
	config: BrowserBridgeConfig,
	method: "GET" | "POST",
	path: string,
	body: unknown,
	unreachableLabel: string,
): Promise<BridgeResponse> {
	let res: Response;
	try {
		res = await fetch(`${config.url}${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${config.secret}`,
				...(body ? { "Content-Type": "application/json" } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});
	} catch (err) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `${unreachableLabel} unreachable: ${
				err instanceof Error ? err.message : String(err)
			}`,
		});
	}
	const parsed = await res.json().catch(() => ({}));
	return { ok: res.ok, status: res.status, body: parsed };
}

export function bridgeErrorDetail(body: unknown): string | undefined {
	const error = (body as { error?: unknown } | null)?.error;
	return typeof error === "string" ? error : undefined;
}
