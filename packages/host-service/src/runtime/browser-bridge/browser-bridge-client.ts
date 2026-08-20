import { TRPCError } from "@trpc/server";
import type { BrowserBridgeConfig } from "../../types";
import type { BrowserPane, ConsoleEntry } from "./types";

export type { BrowserPane, ConsoleEntry } from "./types";

/**
 * Thin HTTP client for the desktop's browser bridge. The bridge is the only
 * thing that can touch a browser pane's guest webContents; this proxies the
 * host-service `browser.*` procedures to it over loopback.
 */
export class BrowserBridgeClient {
	constructor(private readonly config: BrowserBridgeConfig) {}

	private async request<T>(
		method: "GET" | "POST",
		path: string,
		body?: unknown,
	): Promise<T> {
		let res: Response;
		try {
			res = await fetch(`${this.config.url}${path}`, {
				method,
				headers: {
					Authorization: `Bearer ${this.config.secret}`,
					...(body ? { "Content-Type": "application/json" } : {}),
				},
				body: body ? JSON.stringify(body) : undefined,
			});
		} catch (err) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Browser bridge unreachable: ${
					err instanceof Error ? err.message : String(err)
				}`,
			});
		}
		if (!res.ok) {
			const detail = (await res.json().catch(() => ({}))) as { error?: string };
			throw new TRPCError({
				// A missing pane / not-yet-open workspace is a caller-fixable
				// precondition, not an internal fault.
				code:
					res.status === 404 || res.status === 504
						? "NOT_FOUND"
						: "BAD_REQUEST",
				message: detail.error ?? `Browser bridge error (${res.status})`,
			});
		}
		return (await res.json()) as T;
	}

	listPanes(workspaceId: string) {
		return this.request<{ panes: BrowserPane[] }>(
			"GET",
			`/panes?workspaceId=${encodeURIComponent(workspaceId)}`,
		);
	}

	open(input: {
		workspaceId: string;
		url: string;
		target: "current-tab" | "new-tab";
	}) {
		return this.request<{ paneId: string; url: string; title: string }>(
			"POST",
			"/open",
			input,
		);
	}

	navigate(workspaceId: string, paneId: string, url: string) {
		return this.request<{ ok: true }>(
			"POST",
			`/panes/${encodeURIComponent(paneId)}/navigate`,
			{ workspaceId, url },
		);
	}

	reload(workspaceId: string, paneId: string, hard: boolean) {
		return this.request<{ ok: true }>(
			"POST",
			`/panes/${encodeURIComponent(paneId)}/reload`,
			{ workspaceId, hard },
		);
	}

	screenshot(workspaceId: string, paneId: string) {
		return this.request<{ base64: string }>(
			"POST",
			`/panes/${encodeURIComponent(paneId)}/screenshot`,
			{ workspaceId },
		);
	}

	evaluate(workspaceId: string, paneId: string, code: string) {
		return this.request<{ result: unknown }>(
			"POST",
			`/panes/${encodeURIComponent(paneId)}/eval`,
			{ workspaceId, code },
		);
	}

	console(workspaceId: string, paneId: string) {
		return this.request<{ entries: ConsoleEntry[] }>(
			"GET",
			`/panes/${encodeURIComponent(paneId)}/console?workspaceId=${encodeURIComponent(workspaceId)}`,
		);
	}

	importSources() {
		return this.request<{
			sources: { id: string; browserName: string; profileName: string }[];
		}>("GET", "/import-sources");
	}

	importCookies(workspaceId: string, paneId: string, sourceId: string) {
		return this.request<{
			imported: number;
			skipped: number;
			keyUnavailable: boolean;
		}>("POST", `/panes/${encodeURIComponent(paneId)}/import-cookies`, {
			workspaceId,
			sourceId,
		});
	}
}
