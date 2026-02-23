import {
	type LoadedMcpToolsetsResult,
	loadMcpToolsetsForChat,
} from "@superset/agent";
import type { GetHeaders } from "../../../lib/auth/auth";
import type { McpConfigSnapshot } from "./run-agent";
import { writeMcpConfigChunk } from "./run-agent";
import type { SessionHost } from "./session-host";

interface McpRuntimeManagerOptions {
	sessionId: string;
	cwd: string;
	apiUrl: string;
	getHeaders: GetHeaders;
	loadMcpToolsets?: (
		options: Parameters<typeof loadMcpToolsetsForChat>[0],
	) => Promise<LoadedMcpToolsetsResult>;
	retryOnIssuesMs?: number;
	now?: () => number;
}

const DEFAULT_RETRY_ON_ISSUES_MS = 30_000;

function normalizeHeaderEntries(
	headers: Record<string, string>,
): Array<[string, string]> {
	return Object.entries(headers)
		.map(([key, value]) => [key.toLowerCase(), value] as [string, string])
		.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
}

function serializeHeaders(headers: Record<string, string>): string {
	return JSON.stringify(normalizeHeaderEntries(headers));
}

function toMcpSnapshot(result: LoadedMcpToolsetsResult): McpConfigSnapshot {
	return {
		serverNames: result.serverNames,
		sources: result.sources,
		issues: result.issues,
		errors: result.errors,
	};
}

export class McpRuntimeManager {
	private readonly sessionId: string;
	private readonly cwd: string;
	private readonly apiUrl: string;
	private readonly getHeaders: GetHeaders;
	private readonly loadMcpToolsets: (
		options: Parameters<typeof loadMcpToolsetsForChat>[0],
	) => Promise<LoadedMcpToolsetsResult>;
	private readonly retryOnIssuesMs: number;
	private readonly now: () => number;

	private cachedResult: LoadedMcpToolsetsResult | null = null;
	private lastAuthSignature: string | null = null;
	private loadPromise: Promise<LoadedMcpToolsetsResult> | null = null;
	private loadSignature: string | null = null;
	private lastLoadedAtMs: number | null = null;

	constructor(options: McpRuntimeManagerOptions) {
		this.sessionId = options.sessionId;
		this.cwd = options.cwd;
		this.apiUrl = options.apiUrl;
		this.getHeaders = options.getHeaders;
		this.loadMcpToolsets = options.loadMcpToolsets ?? loadMcpToolsetsForChat;
		this.retryOnIssuesMs =
			options.retryOnIssuesMs ?? DEFAULT_RETRY_ON_ISSUES_MS;
		this.now = options.now ?? Date.now;
	}

	async getOrLoad(): Promise<LoadedMcpToolsetsResult> {
		const headers = await this.resolveAuthHeaders();
		const signature = serializeHeaders(headers);

		if (this.cachedResult && this.lastAuthSignature === signature) {
			const lastLoadedAtMs = this.lastLoadedAtMs;
			const hasIssues = this.cachedResult.issues.length > 0;
			const shouldRetryIssues =
				hasIssues &&
				lastLoadedAtMs !== null &&
				this.now() - lastLoadedAtMs >= this.retryOnIssuesMs;
			if (!shouldRetryIssues) {
				return this.cachedResult;
			}
		}

		if (this.loadPromise && this.loadSignature === signature) {
			return this.loadPromise;
		}

		return this.loadWithHeaders(headers, signature);
	}

	async refresh(): Promise<LoadedMcpToolsetsResult> {
		const headers = await this.resolveAuthHeaders();
		const signature = serializeHeaders(headers);
		return this.loadWithHeaders(headers, signature);
	}

	async writeStatusChunk(host: SessionHost): Promise<void> {
		const result = await this.getOrLoad();
		await writeMcpConfigChunk(host, toMcpSnapshot(result));
	}

	async disconnect(): Promise<void> {
		const current = this.cachedResult;
		this.cachedResult = null;
		this.lastAuthSignature = null;
		this.loadPromise = null;
		this.loadSignature = null;
		this.lastLoadedAtMs = null;
		if (!current) return;
		await current.disconnect();
	}

	private async resolveAuthHeaders(): Promise<Record<string, string>> {
		try {
			return await this.getHeaders();
		} catch (error) {
			console.warn(
				`[stream-watcher] Failed to resolve auth headers for ${this.sessionId}:`,
				error,
			);
			return {};
		}
	}

	private async loadWithHeaders(
		authHeaders: Record<string, string>,
		signature: string,
	): Promise<LoadedMcpToolsetsResult> {
		const existingPromise =
			this.loadPromise && this.loadSignature === signature
				? this.loadPromise
				: null;
		if (existingPromise) return existingPromise;

		const loadPromise = (async () => {
			const nextResult = await this.loadMcpToolsets({
				cwd: this.cwd,
				apiUrl: this.apiUrl,
				authHeaders,
			});

			const previous = this.cachedResult;
			this.cachedResult = nextResult;
			this.lastAuthSignature = signature;
			this.lastLoadedAtMs = this.now();

			if (previous && previous !== nextResult) {
				void previous.disconnect().catch((error) => {
					console.warn(
						`[stream-watcher] Failed to disconnect MCP toolsets for ${this.sessionId}:`,
						error,
					);
				});
			}

			return nextResult;
		})();

		this.loadPromise = loadPromise;
		this.loadSignature = signature;

		try {
			return await loadPromise;
		} finally {
			if (this.loadPromise === loadPromise) {
				this.loadPromise = null;
				this.loadSignature = null;
			}
		}
	}
}
