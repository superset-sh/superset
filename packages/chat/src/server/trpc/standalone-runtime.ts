import {
	chmodSync,
	existsSync,
	mkdirSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type Options as ClaudeOptions,
	type PermissionResult,
	type PermissionUpdate,
	query as queryClaude,
	type SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { AppRouter } from "@superset/trpc";
import type { createTRPCClient } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import { classifyAgentToolName } from "../../shared";
import type {
	PermissionModeInput,
	SendMessageInput,
	ThinkingLevel,
} from "./zod";

type ApiClient = ReturnType<typeof createTRPCClient<AppRouter>>;
type RouterOutputs = inferRouterOutputs<AppRouter>;
type SyncModelProvider = RouterOutputs["modelProvider"]["syncPayload"][number];

type ProviderMessageRole = "system" | "user" | "assistant";
type ProviderMessage = {
	role: ProviderMessageRole;
	content: string;
};

type StandaloneMessageContent =
	| { type: "text"; text: string }
	| { type: "reasoning"; text: string }
	| { type: "thinking"; thinking: string }
	| {
			type: "tool_call";
			id: string;
			name: string;
			args: Record<string, unknown>;
	  }
	| {
			type: "tool_result";
			id: string;
			name: string;
			result: unknown;
			isError?: boolean;
	  }
	| {
			type: "permission_requested";
			id: string;
			toolCallId: string;
			toolName: string;
			args: Record<string, unknown>;
			title?: string;
			displayName?: string;
			description?: string;
			decisionReason?: string;
			blockedPath?: string;
	  }
	| {
			type: "permission_resolved";
			id: string;
			requestId: string;
			toolCallId: string;
			toolName: string;
			decision: "approve" | "decline" | "always_allow_category" | "denied";
			message?: string;
	  }
	| {
			type: "tool_progress";
			id: string;
			toolCallId: string;
			toolName: string;
			elapsedTimeSeconds?: number;
			status?: "running" | "completed" | "failed" | "cancelled";
			summary?: string;
			taskId?: string;
	  }
	| {
			type: "subagent_event";
			id: string;
			taskId: string;
			toolCallId?: string;
			status:
				| "started"
				| "progress"
				| "updated"
				| "completed"
				| "failed"
				| "stopped";
			description?: string;
			subagentType?: string;
			summary?: string;
			lastToolName?: string;
			usage?: {
				totalTokens?: number;
				toolUses?: number;
				durationMs?: number;
			};
	  }
	| {
			type: "mode_changed";
			id: string;
			provider: string;
			mode: string;
			label?: string;
	  }
	| {
			type: "model_changed";
			id: string;
			provider: string;
			model: string;
			label?: string;
	  }
	| {
			type: "context_attachment";
			id: string;
			kind: "file" | "image" | "url" | "tool_artifact";
			title: string;
			url?: string;
			mediaType?: string;
			filename?: string;
			sourceToolCallId?: string;
	  }
	| {
			type: "branch_marker";
			id: string;
			label: string;
			branchId?: string;
			status: "placeholder" | "available" | "active";
	  }
	| {
			type: "file";
			data: string;
			mediaType: string;
			filename?: string;
	  }
	| {
			type: "image";
			data: string;
			mimeType: string;
	  };

export interface StandaloneMessage {
	id: string;
	role: "user" | "assistant";
	content: StandaloneMessageContent[];
	createdAt: Date;
	stopReason?: "end_turn" | "error" | "aborted";
	errorMessage?: string;
}

type ToolApprovalDecision = "approve" | "decline" | "always_allow_category";

interface StandalonePendingApproval {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	title?: string;
	displayName?: string;
	description?: string;
	decisionReason?: string;
	blockedPath?: string;
}

interface StandaloneToolApprovalRequest extends StandalonePendingApproval {
	suggestions?: PermissionUpdate[];
	signal: AbortSignal;
}

interface StandaloneToolApprovalResponse {
	decision: ToolApprovalDecision;
	suggestions?: PermissionUpdate[];
}

interface StandaloneSession {
	sessionId: string;
	messages: StandaloneMessage[];
	isRunning: boolean;
	currentMessage: StandaloneMessage | null;
	lastErrorMessage: string | null;
	abortController: AbortController | null;
	pendingApproval: StandalonePendingApproval | null;
	pendingApprovalResolvers: Map<
		string,
		{
			resolve: (response: StandaloneToolApprovalResponse) => void;
			reject: (error: Error) => void;
			suggestions?: PermissionUpdate[];
		}
	>;
	titleSet: boolean;
	hydrated: boolean;
	lastHydratedAt: number;
	hydrationPromise: Promise<void> | null;
}

type StandaloneChatProviderEvent =
	| { type: "text-delta"; text: string }
	| { type: "reasoning-delta"; text: string }
	| {
			type: "tool-call";
			id: string;
			name: string;
			args: Record<string, unknown>;
	  }
	| {
			type: "tool-result";
			id: string;
			name?: string;
			result: unknown;
			isError?: boolean;
	  }
	| {
			type: "permission-denied";
			id: string;
			name: string;
			message: string;
	  }
	| {
			type: "tool-progress";
			id: string;
			name: string;
			elapsedTimeSeconds?: number;
			status?: "running" | "completed" | "failed" | "cancelled";
			summary?: string;
			taskId?: string;
	  }
	| {
			type: "subagent-event";
			id: string;
			taskId: string;
			toolCallId?: string;
			status:
				| "started"
				| "progress"
				| "updated"
				| "completed"
				| "failed"
				| "stopped";
			description?: string;
			subagentType?: string;
			summary?: string;
			lastToolName?: string;
			usage?: {
				totalTokens?: number;
				toolUses?: number;
				durationMs?: number;
			};
	  };

interface StandaloneChatProviderResponse {
	text: string;
	reasoningText: string;
}

type StandaloneRuntimeLogMeta = Record<
	string,
	string | number | boolean | null | undefined
>;

export interface StandaloneChatRuntimeLogger {
	info?: (message: string, meta?: StandaloneRuntimeLogMeta) => void;
	warn?: (message: string, meta?: StandaloneRuntimeLogMeta) => void;
	error?: (message: string, meta?: StandaloneRuntimeLogMeta) => void;
}

export interface StandaloneChatProvider {
	sendTurn(args: {
		messages: ProviderMessage[];
		modelId?: string;
		cwd: string;
		env: Record<string, string>;
		modelProvider?: {
			id: string;
			name: string;
			protocol: string;
			baseUrl: string;
		};
		thinkingLevel?: ThinkingLevel;
		permissionMode?: PermissionModeInput;
		signal: AbortSignal;
		onEvent: (event: StandaloneChatProviderEvent) => void;
		requestToolApproval: (
			request: StandaloneToolApprovalRequest,
		) => Promise<StandaloneToolApprovalResponse>;
	}): Promise<StandaloneChatProviderResponse>;
}

const CLOUD_MESSAGE_REFRESH_INTERVAL_MS = 2000;
const CLOUD_MESSAGE_HYDRATION_TIMEOUT_MS = 8000;
export const STANDALONE_CHAT_CLAUDE_MAX_TURNS: number | null = null;
const WEB_CONTEXT_FETCH_TIMEOUT_MS = 10_000;
const WEB_CONTEXT_MAX_URLS = 3;
const WEB_CONTEXT_MAX_RESPONSE_BYTES = 512_000;
const WEB_CONTEXT_MAX_CHARS_PER_URL = 12_000;
const WEB_CONTEXT_MAX_TOTAL_CHARS = 24_000;
const STANDALONE_CHAT_DIR_MODE = 0o700;
const STANDALONE_CHAT_SETTINGS_FILE_MODE = 0o600;
const STANDALONE_CHAT_HOME_DIR_ENV = "SUPERSET_STANDALONE_CHAT_HOME_DIR";
const defaultStandaloneRuntimeLogger: StandaloneChatRuntimeLogger = {
	info: (message, meta) => console.info(message, meta),
	warn: (message, meta) => console.warn(message, meta),
	error: (message, meta) => console.error(message, meta),
};

type ClaudeProviderRuntimeConfig = {
	provider: {
		id: string;
		name: string;
		protocol: string;
		baseUrl: string;
	};
	env: Record<string, string>;
};

function resolveUserSupersetHomeDir(): string {
	return join(homedir(), ".superset");
}

function isRepoLocalDevSupersetHome(dir: string): boolean {
	return dir.split(/[\\/]+/).includes("superset-dev-data");
}

function resolveStandaloneChatRootDir(): string {
	const override = process.env[STANDALONE_CHAT_HOME_DIR_ENV]?.trim();
	if (override) return override;

	const supersetHomeDir = process.env.SUPERSET_HOME_DIR?.trim();
	if (!supersetHomeDir) return join(resolveUserSupersetHomeDir(), "chat");
	if (isRepoLocalDevSupersetHome(supersetHomeDir)) {
		return join(resolveUserSupersetHomeDir(), "dev-chat");
	}
	return join(supersetHomeDir, "chat");
}

function resolveStandaloneChatCwd(sessionId: string): string {
	return join(resolveStandaloneChatRootDir(), sessionId);
}

function ensureStandaloneChatCwd(sessionId: string): string {
	const cwd = resolveStandaloneChatCwd(sessionId);
	mkdirSync(cwd, { recursive: true, mode: STANDALONE_CHAT_DIR_MODE });
	chmodSync(cwd, STANDALONE_CHAT_DIR_MODE);
	return cwd;
}

function currentProcessEnv(): Record<string, string> {
	return Object.fromEntries(
		Object.entries(process.env).filter(
			(entry): entry is [string, string] => typeof entry[1] === "string",
		),
	);
}

function buildStandaloneClaudeProcessEnv(args: {
	cwd: string;
	providerEnv?: Record<string, string>;
}): Record<string, string> {
	return {
		...currentProcessEnv(),
		...args.providerEnv,
		PWD: args.cwd,
		INIT_CWD: args.cwd,
		OLDPWD: args.cwd,
	};
}

function buildClaudeProviderEnv(args: {
	provider: Pick<SyncModelProvider, "baseUrl" | "secret">;
	modelId?: string;
}): Record<string, string> {
	const modelId = normalizeClaudeCodeModelId(args.modelId);
	return {
		ENABLE_TOOL_SEARCH: "true",
		ANTHROPIC_AUTH_TOKEN: args.provider.secret ?? "",
		ANTHROPIC_BASE_URL: args.provider.baseUrl,
		API_TIMEOUT_MS: "3000000",
		CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
		...(modelId
			? {
					ANTHROPIC_DEFAULT_HAIKU_MODEL: modelId,
					ANTHROPIC_DEFAULT_SONNET_MODEL: modelId,
					ANTHROPIC_DEFAULT_OPUS_MODEL: modelId,
				}
			: {}),
		CLAUDE_CODE_DISABLE_1M_CONTEXT: "1",
	};
}

function writeClaudeSettingsLocal(args: {
	cwd: string;
	env: Record<string, string>;
}): void {
	const claudeDir = join(args.cwd, ".claude");
	mkdirSync(claudeDir, { recursive: true, mode: STANDALONE_CHAT_DIR_MODE });
	chmodSync(claudeDir, STANDALONE_CHAT_DIR_MODE);
	const settingsPath = join(claudeDir, "settings.local.json");
	writeFileSync(
		settingsPath,
		`${JSON.stringify({ env: args.env }, null, 2)}\n`,
		{
			mode: STANDALONE_CHAT_SETTINGS_FILE_MODE,
		},
	);
	chmodSync(settingsPath, STANDALONE_CHAT_SETTINGS_FILE_MODE);
}

function claudeAgentPlatformPackageName(): string | null {
	const arch = process.arch === "x64" ? "x64" : process.arch;
	if (process.platform === "darwin") {
		return `@anthropic-ai/claude-agent-sdk-darwin-${arch}`;
	}
	if (process.platform === "linux") {
		return `@anthropic-ai/claude-agent-sdk-linux-${arch}`;
	}
	if (process.platform === "win32") {
		return `@anthropic-ai/claude-agent-sdk-win32-${arch}`;
	}
	return null;
}

function claudeAgentExecutableName(): string {
	return process.platform === "win32" ? "claude.exe" : "claude";
}

function resolveExistingPath(candidates: string[]): string | undefined {
	return candidates.find((candidate) => existsSync(candidate));
}

function nearestNodeModulesDirs(startDir: string): string[] {
	const dirs: string[] = [];
	let current = startDir;
	const root = parse(current).root;
	while (true) {
		const candidate = join(current, "node_modules");
		if (existsSync(candidate)) dirs.push(candidate);
		if (current === root) return dirs;
		current = dirname(current);
	}
}

function bunStorePackageCandidates(
	nodeModulesDir: string,
	packageName: string,
	executableName: string,
): string[] {
	const bunStoreDir = join(nodeModulesDir, ".bun");
	if (!existsSync(bunStoreDir)) return [];
	const packagePrefix = `${packageName.replace("/", "+")}@`;
	return readdirSync(bunStoreDir)
		.filter((entry) => entry.startsWith(packagePrefix))
		.map((entry) =>
			join(bunStoreDir, entry, "node_modules", packageName, executableName),
		);
}

export function resolveClaudeCodeExecutablePath(): string | undefined {
	const override = process.env.SUPERSET_CLAUDE_CODE_BIN_PATH?.trim();
	if (override) return override;

	const packageName = claudeAgentPlatformPackageName();
	if (!packageName) return undefined;

	const executableName = claudeAgentExecutableName();
	const require = createRequire(import.meta.url);
	const candidates: string[] = [];

	try {
		const packageJsonPath = require.resolve(`${packageName}/package.json`);
		candidates.push(join(dirname(packageJsonPath), executableName));
	} catch {}

	const currentFileDir = dirname(fileURLToPath(import.meta.url));
	const resourcePath = (process as NodeJS.Process & { resourcesPath?: string })
		.resourcesPath;
	for (const baseDir of [
		currentFileDir,
		process.cwd(),
		resourcePath,
		resourcePath ? join(resourcePath, "app.asar.unpacked") : undefined,
	]) {
		if (!baseDir) continue;
		for (const nodeModulesDir of nearestNodeModulesDirs(baseDir)) {
			candidates.push(join(nodeModulesDir, packageName, executableName));
			candidates.push(
				join(
					nodeModulesDir,
					".bun",
					"node_modules",
					packageName,
					executableName,
				),
			);
			candidates.push(
				...bunStorePackageCandidates(
					nodeModulesDir,
					packageName,
					executableName,
				),
			);
		}
	}

	return resolveExistingPath([...new Set(candidates)]);
}

function withTimeout<T>(
	promise: Promise<T>,
	args: { timeoutMs: number; message: string },
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	const timeoutPromise = new Promise<never>((_resolve, reject) => {
		timeout = setTimeout(() => {
			reject(new Error(args.message));
		}, args.timeoutMs);
	});
	return Promise.race([promise, timeoutPromise]).finally(() => {
		if (timeout) clearTimeout(timeout);
	});
}

function randomId(prefix: string): string {
	return `${prefix}-${crypto.randomUUID()}`;
}

function textFromContent(content: StandaloneMessageContent[]): string {
	return content
		.map((part) => (part.type === "text" ? part.text : ""))
		.filter(Boolean)
		.join("\n");
}

function reasoningFromContent(content: StandaloneMessageContent[]): string {
	return content
		.map((part) => {
			if (part.type === "reasoning") return part.text;
			if (part.type === "thinking") return part.thinking;
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function tryParseJsonObject(value: string): Record<string, unknown> | null {
	try {
		const parsed = JSON.parse(value);
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function parsePartialJsonObject(value: string): Record<string, unknown> {
	return tryParseJsonObject(value) ?? {};
}

function toProviderMessages(messages: StandaloneMessage[]) {
	return messages
		.map<ProviderMessage | null>((message) => {
			const content = textFromContent(message.content);
			if (!content) return null;
			return {
				role: message.role,
				content,
			};
		})
		.filter((message): message is ProviderMessage => Boolean(message));
}

function trimTrailingUrlPunctuation(url: string): string {
	let next = url.replace(/[，。！？、；：,.;:!?]+$/g, "");
	while (next.endsWith(")") && !next.includes("(")) {
		next = next.slice(0, -1);
	}
	return next;
}

function extractHttpUrls(text: string): string[] {
	const matches = text.match(/https?:\/\/[^\s<>"'`]+/g) ?? [];
	const seen = new Set<string>();
	const urls: string[] = [];
	for (const match of matches) {
		const url = trimTrailingUrlPunctuation(match);
		try {
			const parsed = new URL(url);
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				continue;
			}
			const normalized = parsed.toString();
			if (seen.has(normalized)) continue;
			seen.add(normalized);
			urls.push(normalized);
			if (urls.length >= WEB_CONTEXT_MAX_URLS) break;
		} catch {}
	}
	return urls;
}

function decodeHtmlEntities(text: string): string {
	return text
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'")
		.replace(/&#(\d+);/g, (_match, value: string) => {
			const codePoint = Number(value);
			return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
		})
		.replace(/&#x([a-f0-9]+);/gi, (_match, value: string) => {
			const codePoint = Number.parseInt(value, 16);
			return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : "";
		});
}

function normalizeExtractedText(text: string): string {
	return decodeHtmlEntities(text)
		.replace(/\r/g, "\n")
		.replace(/[ \t\f\v]+/g, " ")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/[ \t]+\n/g, "\n")
		.trim();
}

function extractTagContent(html: string, tagName: string): string | null {
	const match = html.match(
		new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"),
	);
	return match?.[1] ? normalizeExtractedText(match[1]) : null;
}

function extractMetaDescription(html: string): string | null {
	const metaMatch = html.match(
		/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*>/i,
	);
	if (!metaMatch) return null;
	const contentMatch = metaMatch[0].match(/content=["']([^"']+)["']/i);
	return contentMatch?.[1] ? normalizeExtractedText(contentMatch[1]) : null;
}

function htmlToReadableText(html: string): {
	title: string | null;
	description: string | null;
	text: string;
} {
	const title = extractTagContent(html, "title");
	const description = extractMetaDescription(html);
	const body =
		extractTagContent(html, "article") ??
		extractTagContent(html, "body") ??
		html;
	const text = normalizeExtractedText(
		body
			.replace(/<script[\s\S]*?<\/script>/gi, " ")
			.replace(/<style[\s\S]*?<\/style>/gi, " ")
			.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
			.replace(/<svg[\s\S]*?<\/svg>/gi, " ")
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<\/(p|div|section|article|li|h[1-6]|tr)>/gi, "\n")
			.replace(/<[^>]+>/g, " "),
	);
	return { title, description, text };
}

async function readResponseTextLimited(response: Response): Promise<string> {
	if (!response.body) return response.text();
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let byteLength = 0;
	while (byteLength < WEB_CONTEXT_MAX_RESPONSE_BYTES) {
		const { done, value } = await reader.read();
		if (done) break;
		const remaining = WEB_CONTEXT_MAX_RESPONSE_BYTES - byteLength;
		const chunk =
			value.byteLength > remaining ? value.slice(0, remaining) : value;
		chunks.push(chunk);
		byteLength += chunk.byteLength;
		if (value.byteLength > remaining) break;
	}
	await reader.cancel().catch(() => {});
	const merged = new Uint8Array(byteLength);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(merged);
}

async function fetchWebContext(args: {
	url: string;
	signal: AbortSignal;
}): Promise<
	| {
			status: "ok";
			url: string;
			title: string | null;
			description: string | null;
			text: string;
	  }
	| { status: "error"; url: string; error: string }
> {
	const controller = new AbortController();
	const timeoutId = setTimeout(
		() => controller.abort(),
		WEB_CONTEXT_FETCH_TIMEOUT_MS,
	);
	const abort = () => controller.abort();
	args.signal.addEventListener("abort", abort, { once: true });

	try {
		const response = await fetch(args.url, {
			headers: {
				accept:
					"text/html,text/plain;q=0.9,application/xhtml+xml;q=0.8,*/*;q=0.5",
				"user-agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) SupersetChat/1.0",
			},
			redirect: "follow",
			signal: controller.signal,
		});
		if (!response.ok) {
			return {
				status: "error",
				url: args.url,
				error: `HTTP ${response.status}`,
			};
		}
		const contentType = response.headers.get("content-type") ?? "";
		if (contentType && !/text\/|html|xml|json/i.test(contentType)) {
			return {
				status: "error",
				url: args.url,
				error: `Unsupported content type: ${contentType}`,
			};
		}
		const rawText = await readResponseTextLimited(response);
		const parsed = contentType.includes("html")
			? htmlToReadableText(rawText)
			: {
					title: null,
					description: null,
					text: normalizeExtractedText(rawText),
				};
		const text = parsed.text.slice(0, WEB_CONTEXT_MAX_CHARS_PER_URL);
		if (!text) {
			return {
				status: "error",
				url: args.url,
				error: "No readable text extracted",
			};
		}
		return {
			status: "ok",
			url: args.url,
			title: parsed.title,
			description: parsed.description,
			text,
		};
	} catch (error) {
		return {
			status: "error",
			url: args.url,
			error:
				error instanceof Error && error.name === "AbortError"
					? "Timed out"
					: error instanceof Error
						? error.message
						: "Failed to fetch URL",
		};
	} finally {
		clearTimeout(timeoutId);
		args.signal.removeEventListener("abort", abort);
	}
}

function buildWebContextPrompt(
	contexts: Awaited<ReturnType<typeof fetchWebContext>>[],
): string | null {
	if (contexts.length === 0) return null;
	let remainingChars = WEB_CONTEXT_MAX_TOTAL_CHARS;
	const sections: string[] = [];
	for (const context of contexts) {
		if (context.status === "error") {
			sections.push(
				`URL: ${context.url}\nFetch status: failed (${context.error})`,
			);
			continue;
		}
		const text = context.text.slice(0, remainingChars);
		remainingChars -= text.length;
		sections.push(
			[
				`URL: ${context.url}`,
				context.title ? `Title: ${context.title}` : null,
				context.description ? `Description: ${context.description}` : null,
				"Excerpt:",
				text,
			]
				.filter(Boolean)
				.join("\n"),
		);
		if (remainingChars <= 0) break;
	}

	return [
		"The user included one or more web links. Superset fetched the following URL context for this turn.",
		"Use fetched excerpts as source context when answering. If a fetch failed or the excerpt is insufficient, say exactly what is missing instead of claiming you cannot access links in general.",
		"",
		sections.join("\n\n---\n\n"),
	].join("\n");
}

function normalizeStandaloneMessage(
	message: RouterOutputs["chat"]["listMessages"][number],
): StandaloneMessage {
	return {
		id: message.id,
		role: message.role,
		content: message.content,
		createdAt: message.createdAt,
		...(message.stopReason ? { stopReason: message.stopReason } : {}),
		...(message.errorMessage ? { errorMessage: message.errorMessage } : {}),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecordString(value: unknown, key: string): string {
	return isRecord(value) && typeof value[key] === "string" ? value[key] : "";
}

function readRecordNumber(value: unknown, key: string): number | undefined {
	return isRecord(value) && typeof value[key] === "number"
		? value[key]
		: undefined;
}

function normalizeStandaloneRuntimeError(error: unknown): Error {
	const message =
		error instanceof Error ? error.message : "Failed to send chat message";
	if (/maximum number of turns/i.test(message)) {
		return new Error(
			"Claude Code reported that it reached a max-turn limit. Superset standalone Chat does not set a turn cap; check Claude Code CLI settings/debug logs for the configured limit or a tool loop.",
		);
	}
	return error instanceof Error ? error : new Error(message);
}

function fallbackTitleFromMessage(message: string): string {
	const normalized = message
		.replace(/\s+/g, " ")
		.replace(/[。！？!?.,，、；;：:]+$/g, "")
		.trim();
	if (!normalized) return "New Chat";
	return normalized.length > 42 ? `${normalized.slice(0, 42)}...` : normalized;
}

function appendTextPart(
	message: StandaloneMessage,
	partType: "text" | "reasoning",
	text: string,
): void {
	if (!text) return;
	const previous = message.content.at(-1);
	if (previous?.type === partType) {
		previous.text += text;
		return;
	}
	message.content.push({ type: partType, text });
}

function appendOrUpdateToolCallPart(
	message: StandaloneMessage,
	event: Extract<StandaloneChatProviderEvent, { type: "tool-call" }>,
): void {
	const existing = message.content.find(
		(part): part is Extract<StandaloneMessageContent, { type: "tool_call" }> =>
			part.type === "tool_call" && part.id === event.id,
	);
	if (existing) {
		existing.name = event.name;
		existing.args = event.args;
		return;
	}
	message.content.push({
		type: "tool_call",
		id: event.id,
		name: event.name,
		args: event.args,
	});
}

function appendOrUpdateToolResultPart(
	message: StandaloneMessage,
	event: Extract<StandaloneChatProviderEvent, { type: "tool-result" }>,
): void {
	const toolCall = message.content.find(
		(part): part is Extract<StandaloneMessageContent, { type: "tool_call" }> =>
			part.type === "tool_call" && part.id === event.id,
	);
	const existing = message.content.find(
		(
			part,
		): part is Extract<StandaloneMessageContent, { type: "tool_result" }> =>
			part.type === "tool_result" && part.id === event.id,
	);
	const name = event.name ?? toolCall?.name ?? "Tool";
	if (existing) {
		existing.name = name;
		existing.result = event.result;
		existing.isError = event.isError;
		return;
	}
	message.content.push({
		type: "tool_result",
		id: event.id,
		name,
		result: event.result,
		...(event.isError !== undefined ? { isError: event.isError } : {}),
	});
}

function appendOrUpdatePermissionRequestedPart(
	message: StandaloneMessage,
	request: StandaloneToolApprovalRequest,
): void {
	const id = `permission-${request.toolCallId}`;
	const existing = message.content.find(
		(
			part,
		): part is Extract<
			StandaloneMessageContent,
			{ type: "permission_requested" }
		> => part.type === "permission_requested" && part.id === id,
	);
	const next = {
		type: "permission_requested" as const,
		id,
		toolCallId: request.toolCallId,
		toolName: request.toolName,
		args: request.args,
		...(request.title ? { title: request.title } : {}),
		...(request.displayName ? { displayName: request.displayName } : {}),
		...(request.description ? { description: request.description } : {}),
		...(request.decisionReason
			? { decisionReason: request.decisionReason }
			: {}),
		...(request.blockedPath ? { blockedPath: request.blockedPath } : {}),
	};
	if (existing) {
		Object.assign(existing, next);
		return;
	}
	message.content.push(next);
}

function appendOrUpdatePermissionResolvedPart(
	message: StandaloneMessage,
	args: {
		toolCallId: string;
		toolName: string;
		decision: ToolApprovalDecision | "denied";
		message?: string;
	},
): void {
	const requestId = `permission-${args.toolCallId}`;
	const id = `permission-resolution-${args.toolCallId}`;
	const existing = message.content.find(
		(
			part,
		): part is Extract<
			StandaloneMessageContent,
			{ type: "permission_resolved" }
		> => part.type === "permission_resolved" && part.id === id,
	);
	const next = {
		type: "permission_resolved" as const,
		id,
		requestId,
		toolCallId: args.toolCallId,
		toolName: args.toolName,
		decision: args.decision,
		...(args.message ? { message: args.message } : {}),
	};
	if (existing) {
		Object.assign(existing, next);
		return;
	}
	message.content.push(next);
}

function appendOrUpdateToolProgressPart(
	message: StandaloneMessage,
	event: Extract<StandaloneChatProviderEvent, { type: "tool-progress" }>,
): void {
	const id = `tool-progress-${event.id}`;
	const existing = message.content.find(
		(
			part,
		): part is Extract<StandaloneMessageContent, { type: "tool_progress" }> =>
			part.type === "tool_progress" && part.id === id,
	);
	const next = {
		type: "tool_progress" as const,
		id,
		toolCallId: event.id,
		toolName: event.name,
		...(event.elapsedTimeSeconds !== undefined
			? { elapsedTimeSeconds: event.elapsedTimeSeconds }
			: {}),
		...(event.status ? { status: event.status } : {}),
		...(event.summary ? { summary: event.summary } : {}),
		...(event.taskId ? { taskId: event.taskId } : {}),
	};
	if (existing) {
		Object.assign(existing, next);
		return;
	}
	message.content.push(next);
}

function appendOrUpdateSubagentEventPart(
	message: StandaloneMessage,
	event: Extract<StandaloneChatProviderEvent, { type: "subagent-event" }>,
): void {
	const subagentType = event.subagentType;
	const subagentTypeClassification = subagentType
		? classifyAgentToolName(subagentType)
		: null;
	if (subagentType && subagentTypeClassification?.isKnownDisplayTool) {
		appendOrUpdateToolProgressPart(message, {
			type: "tool-progress",
			id: event.toolCallId || event.taskId,
			name: subagentType,
			status: mapSubagentStatusToToolProgressStatus(event.status),
			...(event.description || event.summary
				? { summary: event.description || event.summary }
				: {}),
			taskId: event.taskId,
		});
		return;
	}

	const id = `subagent-${event.taskId}`;
	const existing = message.content.find(
		(
			part,
		): part is Extract<StandaloneMessageContent, { type: "subagent_event" }> =>
			part.type === "subagent_event" && part.id === id,
	);
	const next = {
		type: "subagent_event" as const,
		id,
		taskId: event.taskId,
		...(event.toolCallId ? { toolCallId: event.toolCallId } : {}),
		status: event.status,
		...(event.description ? { description: event.description } : {}),
		...(event.subagentType ? { subagentType: event.subagentType } : {}),
		...(event.summary ? { summary: event.summary } : {}),
		...(event.lastToolName ? { lastToolName: event.lastToolName } : {}),
		...(event.usage ? { usage: event.usage } : {}),
	};
	if (existing) {
		Object.assign(existing, next);
		return;
	}
	message.content.push(next);
}

function mapSubagentStatusToToolProgressStatus(
	status: Extract<
		StandaloneChatProviderEvent,
		{ type: "subagent-event" }
	>["status"],
): Extract<StandaloneChatProviderEvent, { type: "tool-progress" }>["status"] {
	if (status === "completed") return "completed";
	if (status === "failed") return "failed";
	if (status === "stopped") return "cancelled";
	return "running";
}

function buildTurnMetadataParts(args: {
	modelId?: string;
	modelProviderName?: string;
	permissionMode?: PermissionModeInput;
	userMessage: StandaloneMessage;
}): StandaloneMessageContent[] {
	const providerName = args.modelProviderName?.trim() || "Claude Code";
	const modelLabel = args.modelId?.trim() || "Claude Code Default";
	const parts: StandaloneMessageContent[] = [
		{
			type: "model_changed",
			id: randomId("model"),
			provider: providerName,
			model: args.modelId?.trim() || "claude-code-default",
			label: modelLabel,
		},
		{
			type: "mode_changed",
			id: randomId("mode"),
			provider: providerName,
			mode: args.permissionMode ?? "auto",
			label: args.permissionMode ?? "auto",
		},
		{
			type: "branch_marker",
			id: randomId("branch"),
			label: "Branch conversations",
			status: "placeholder",
		},
	];

	const userText = textFromContent(args.userMessage.content);
	for (const url of extractHttpUrls(userText)) {
		parts.push({
			type: "context_attachment",
			id: randomId("context-url"),
			kind: "url",
			title: url,
			url,
		});
	}
	for (const part of args.userMessage.content) {
		if (part.type === "file") {
			parts.push({
				type: "context_attachment",
				id: randomId("context-file"),
				kind: part.mediaType.startsWith("image/") ? "image" : "file",
				title: part.filename ?? "Attached file",
				mediaType: part.mediaType,
				...(part.filename ? { filename: part.filename } : {}),
			});
		}
		if (part.type === "image") {
			parts.push({
				type: "context_attachment",
				id: randomId("context-image"),
				kind: "image",
				title: "Attached image",
				mediaType: part.mimeType,
			});
		}
	}

	return parts;
}

function buildClaudePrompt(args: {
	messages: ProviderMessage[];
	cwd: string;
}): string {
	const sections = args.messages.map((message) => {
		const role =
			message.role === "system"
				? "System"
				: message.role === "assistant"
					? "Assistant"
					: "User";
		return `${role}:\n${message.content}`;
	});

	return [
		"You are Superset Chat, a concise host assistant powered by Claude Code.",
		"You may use available Claude Code tools for host-level inspection, safe maintenance, file lookup, process diagnostics, and other explicitly requested local actions.",
		`Your working directory is the isolated per-chat directory: ${args.cwd}.`,
		"Do not infer project context from the Superset app source checkout or parent process working directory. Only inspect other directories when the user explicitly asks for them or provides a path.",
		"Answer the latest user message. The previous transcript is provided below.",
		"Do not mention internal transcript formatting unless it is relevant to the user's request.",
		"",
		sections.join("\n\n---\n\n"),
	].join("\n");
}

function thinkingOptionsForLevel(
	thinkingLevel: ThinkingLevel | undefined,
): Pick<ClaudeOptions, "thinking" | "effort"> {
	if (!thinkingLevel || thinkingLevel === "off") {
		return { thinking: { type: "disabled" } };
	}
	return {
		thinking: { type: "adaptive" },
		effort: thinkingLevel,
	};
}

function permissionOptionsForMode(
	permissionMode: PermissionModeInput | undefined,
): Pick<ClaudeOptions, "allowDangerouslySkipPermissions" | "permissionMode"> {
	const mode = permissionMode ?? "auto";
	return {
		permissionMode: mode,
		...(mode === "bypassPermissions"
			? { allowDangerouslySkipPermissions: true }
			: {}),
	};
}

function shouldUseSupersetApprovalCallback(
	permissionMode: PermissionModeInput | undefined,
): boolean {
	const mode = permissionMode ?? "auto";
	return mode === "default" || mode === "acceptEdits";
}

function toClaudePermissionResult(args: {
	request: StandaloneToolApprovalRequest;
	response: StandaloneToolApprovalResponse;
}): PermissionResult {
	if (args.response.decision === "decline") {
		return {
			behavior: "deny",
			message: "User declined the tool request.",
			toolUseID: args.request.toolCallId,
		};
	}
	return {
		behavior: "allow",
		toolUseID: args.request.toolCallId,
		...(args.response.decision === "always_allow_category" &&
		args.response.suggestions
			? { updatedPermissions: args.response.suggestions }
			: {}),
	};
}

function normalizeClaudeCodeModelId(
	modelId: string | undefined,
): string | undefined {
	const trimmed = modelId?.trim();
	if (!trimmed || trimmed === "claude-code-default") return undefined;
	return trimmed;
}

function extractDeltaFromClaudeMessage(message: SDKMessage): {
	text: string;
	reasoningText: string;
} {
	if (message.type !== "stream_event") {
		return { text: "", reasoningText: "" };
	}

	const event = message.event as unknown;
	if (!isRecord(event)) {
		return { text: "", reasoningText: "" };
	}
	const delta = isRecord(event.delta) ? event.delta : {};
	const deltaType = readRecordString(delta, "type");
	const text =
		deltaType === "text_delta" ? readRecordString(delta, "text") : "";
	const reasoningText =
		readRecordString(delta, "thinking") ||
		readRecordString(delta, "reasoning") ||
		readRecordString(delta, "summary") ||
		"";
	return { text, reasoningText };
}

interface ClaudeToolCallState {
	id: string;
	name: string;
	partialJson: string;
	args: Record<string, unknown>;
	lastEmittedArgsJson: string;
}

function normalizeClaudeToolResultContent(value: unknown): unknown {
	if (typeof value === "string") return { content: value };
	if (Array.isArray(value)) {
		const textParts = value
			.map((part) => {
				if (typeof part === "string") return part;
				if (isRecord(part)) return readRecordString(part, "text");
				return "";
			})
			.filter(Boolean);
		if (textParts.length > 0) return { content: textParts.join("\n") };
		return value;
	}
	return value ?? {};
}

function extractToolUseBlocksFromClaudeAssistantMessage(
	message: SDKMessage,
): Array<{ id: string; name: string; args: Record<string, unknown> }> {
	if (message.type !== "assistant") return [];
	const content = (message.message as unknown as { content?: unknown }).content;
	if (!Array.isArray(content)) return [];
	return content.flatMap((block) => {
		if (!isRecord(block) || block.type !== "tool_use") return [];
		const id = readRecordString(block, "id");
		const name = readRecordString(block, "name");
		const input = isRecord(block.input) ? block.input : {};
		return id && name ? [{ id, name, args: input }] : [];
	});
}

function extractToolResultBlocksFromClaudeUserMessage(
	message: SDKMessage,
): Array<{ id: string; result: unknown; isError?: boolean }> {
	if (message.type !== "user") return [];
	const content = (message.message as unknown as { content?: unknown }).content;
	if (!Array.isArray(content)) return [];
	const topLevelResult = (message as unknown as { tool_use_result?: unknown })
		.tool_use_result;
	return content.flatMap((block) => {
		if (!isRecord(block) || block.type !== "tool_result") return [];
		const id = readRecordString(block, "tool_use_id");
		if (!id) return [];
		const isError =
			typeof block.is_error === "boolean" ? block.is_error : undefined;
		return [
			{
				id,
				result:
					topLevelResult !== undefined
						? topLevelResult
						: normalizeClaudeToolResultContent(block.content),
				...(isError !== undefined ? { isError } : {}),
			},
		];
	});
}

function mapTaskPatchStatus(
	status: unknown,
): Extract<StandaloneChatProviderEvent, { type: "subagent-event" }>["status"] {
	switch (status) {
		case "completed":
			return "completed";
		case "failed":
			return "failed";
		case "killed":
			return "stopped";
		case "paused":
		case "pending":
		case "running":
			return "updated";
		default:
			return "updated";
	}
}

function readUsage(value: unknown):
	| {
			totalTokens?: number;
			toolUses?: number;
			durationMs?: number;
	  }
	| undefined {
	if (!isRecord(value)) return undefined;
	const usage = {
		...(typeof value.total_tokens === "number"
			? { totalTokens: value.total_tokens }
			: {}),
		...(typeof value.tool_uses === "number"
			? { toolUses: value.tool_uses }
			: {}),
		...(typeof value.duration_ms === "number"
			? { durationMs: value.duration_ms }
			: {}),
	};
	return Object.keys(usage).length > 0 ? usage : undefined;
}

function extractTimelineEventsFromClaudeMessage(
	message: SDKMessage,
): StandaloneChatProviderEvent[] {
	const record = message as unknown;
	if (!isRecord(record)) return [];

	if (record.type === "tool_progress") {
		const id = readRecordString(record, "tool_use_id");
		const name = readRecordString(record, "tool_name");
		if (!id || !name) return [];
		return [
			{
				type: "tool-progress",
				id,
				name,
				status: "running",
				...(readRecordNumber(record, "elapsed_time_seconds") !== undefined
					? {
							elapsedTimeSeconds: readRecordNumber(
								record,
								"elapsed_time_seconds",
							),
						}
					: {}),
				...(readRecordString(record, "task_id")
					? { taskId: readRecordString(record, "task_id") }
					: {}),
			},
		];
	}

	if (record.type === "tool_use_summary") {
		const summary = readRecordString(record, "summary");
		const ids = Array.isArray(record.preceding_tool_use_ids)
			? record.preceding_tool_use_ids.filter(
					(id): id is string => typeof id === "string" && id.length > 0,
				)
			: [];
		return ids.map((id) => ({
			type: "tool-progress",
			id,
			name: "Tool",
			status: "completed",
			summary,
		}));
	}

	if (record.type !== "system") return [];
	const subtype = readRecordString(record, "subtype");

	if (subtype === "permission_denied") {
		const id = readRecordString(record, "tool_use_id");
		const name = readRecordString(record, "tool_name");
		if (!id || !name) return [];
		return [
			{
				type: "permission-denied",
				id,
				name,
				message: readRecordString(record, "message") || "Permission denied.",
			},
		];
	}

	if (subtype === "task_started") {
		const taskId = readRecordString(record, "task_id");
		if (!taskId) return [];
		return [
			{
				type: "subagent-event",
				id: taskId,
				taskId,
				status: "started",
				...(readRecordString(record, "tool_use_id")
					? { toolCallId: readRecordString(record, "tool_use_id") }
					: {}),
				...(readRecordString(record, "description")
					? { description: readRecordString(record, "description") }
					: {}),
				...(readRecordString(record, "subagent_type")
					? { subagentType: readRecordString(record, "subagent_type") }
					: readRecordString(record, "task_type")
						? { subagentType: readRecordString(record, "task_type") }
						: {}),
			},
		];
	}

	if (subtype === "task_progress") {
		const taskId = readRecordString(record, "task_id");
		if (!taskId) return [];
		return [
			{
				type: "subagent-event",
				id: taskId,
				taskId,
				status: "progress",
				...(readRecordString(record, "tool_use_id")
					? { toolCallId: readRecordString(record, "tool_use_id") }
					: {}),
				...(readRecordString(record, "description")
					? { description: readRecordString(record, "description") }
					: {}),
				...(readRecordString(record, "subagent_type")
					? { subagentType: readRecordString(record, "subagent_type") }
					: {}),
				...(readRecordString(record, "summary")
					? { summary: readRecordString(record, "summary") }
					: {}),
				...(readRecordString(record, "last_tool_name")
					? { lastToolName: readRecordString(record, "last_tool_name") }
					: {}),
				...(readUsage(record.usage) ? { usage: readUsage(record.usage) } : {}),
			},
		];
	}

	if (subtype === "task_updated") {
		const taskId = readRecordString(record, "task_id");
		const patch = isRecord(record.patch) ? record.patch : {};
		if (!taskId) return [];
		const status = mapTaskPatchStatus(patch.status);
		return [
			{
				type: "subagent-event",
				id: taskId,
				taskId,
				status,
				...(typeof patch.description === "string"
					? { description: patch.description }
					: {}),
				...(typeof patch.error === "string" ? { summary: patch.error } : {}),
			},
		];
	}

	if (subtype === "task_notification") {
		const taskId = readRecordString(record, "task_id");
		if (!taskId) return [];
		return [
			{
				type: "subagent-event",
				id: taskId,
				taskId,
				status:
					record.status === "completed"
						? "completed"
						: record.status === "failed"
							? "failed"
							: "stopped",
				...(readRecordString(record, "tool_use_id")
					? { toolCallId: readRecordString(record, "tool_use_id") }
					: {}),
				...(readRecordString(record, "summary")
					? { summary: readRecordString(record, "summary") }
					: {}),
				...(readUsage(record.usage) ? { usage: readUsage(record.usage) } : {}),
			},
		];
	}

	if (
		subtype === "hook_started" ||
		subtype === "hook_progress" ||
		subtype === "hook_response"
	) {
		const hookId = readRecordString(record, "hook_id");
		if (!hookId) return [];
		const hookName = readRecordString(record, "hook_name");
		const hookEvent = readRecordString(record, "hook_event");
		const hookOutcome = readRecordString(record, "outcome");
		const output =
			readRecordString(record, "output") ||
			readRecordString(record, "stdout") ||
			readRecordString(record, "stderr");
		const isFailure =
			subtype === "hook_response" &&
			hookOutcome !== "" &&
			hookOutcome !== "success" &&
			hookOutcome !== "cancelled";
		if (!isFailure) {
			return [];
		}
		return [
			{
				type: "subagent-event",
				id: hookId,
				taskId: hookId,
				status: "failed",
				subagentType: "hook",
				description: [hookName, hookEvent].filter(Boolean).join(" / "),
				...(output ? { summary: output } : {}),
			},
		];
	}

	return [];
}

function extractAssistantContentFromClaudeMessage(message: SDKMessage): {
	text: string;
	reasoningText: string;
} {
	if (message.type === "result") {
		return {
			text:
				"result" in message && typeof message.result === "string"
					? message.result
					: "",
			reasoningText: "",
		};
	}

	if (message.type !== "assistant") {
		return { text: "", reasoningText: "" };
	}

	const content = (message.message as unknown as { content?: unknown }).content;
	if (!Array.isArray(content)) {
		return { text: "", reasoningText: "" };
	}
	const textParts: string[] = [];
	const reasoningParts: string[] = [];
	for (const block of content) {
		if (!isRecord(block)) continue;
		if (block.type === "text") {
			const text = readRecordString(block, "text");
			if (text) textParts.push(text);
		}
		if (block.type === "thinking" || block.type === "thinking_delta") {
			const thinking = readRecordString(block, "thinking");
			if (thinking) reasoningParts.push(thinking);
		}
	}
	return {
		text: textParts.join(""),
		reasoningText: reasoningParts.join("\n"),
	};
}

export class ClaudeStandaloneChatProvider implements StandaloneChatProvider {
	async sendTurn(args: {
		messages: ProviderMessage[];
		modelId?: string;
		cwd: string;
		env: Record<string, string>;
		modelProvider?: {
			id: string;
			name: string;
			protocol: string;
			baseUrl: string;
		};
		thinkingLevel?: ThinkingLevel;
		permissionMode?: PermissionModeInput;
		signal: AbortSignal;
		onEvent: (event: StandaloneChatProviderEvent) => void;
		requestToolApproval: (
			request: StandaloneToolApprovalRequest,
		) => Promise<StandaloneToolApprovalResponse>;
	}): Promise<StandaloneChatProviderResponse> {
		const abortController = new AbortController();
		const abort = () => abortController.abort(args.signal.reason);
		args.signal.addEventListener("abort", abort, { once: true });

		let streamedText = "";
		let streamedReasoningText = "";
		let finalText = "";
		let finalReasoningText = "";
		const errors: string[] = [];
		const toolCallsByBlockIndex = new Map<number, ClaudeToolCallState>();
		const toolNamesById = new Map<string, string>();
		const emittedToolArgsById = new Map<string, string>();
		const emitToolCallIfChanged = (event: {
			id: string;
			name: string;
			args: Record<string, unknown>;
		}) => {
			const argsJson = JSON.stringify(event.args);
			if (emittedToolArgsById.get(event.id) === argsJson) return;
			emittedToolArgsById.set(event.id, argsJson);
			args.onEvent({ type: "tool-call", ...event });
		};

		try {
			const claudeCodeExecutablePath = resolveClaudeCodeExecutablePath();
			const modelId = normalizeClaudeCodeModelId(args.modelId);
			const claudeQuery = queryClaude({
				prompt: buildClaudePrompt({
					messages: args.messages,
					cwd: args.cwd,
				}),
				options: {
					abortController,
					includePartialMessages: true,
					includeHookEvents: true,
					persistSession: false,
					tools: { type: "preset", preset: "claude_code" },
					cwd: args.cwd,
					env: args.env,
					...(claudeCodeExecutablePath
						? { pathToClaudeCodeExecutable: claudeCodeExecutablePath }
						: {}),
					...(modelId ? { model: modelId } : {}),
					...(shouldUseSupersetApprovalCallback(args.permissionMode)
						? {
								canUseTool: async (toolName, input, options) => {
									const request: StandaloneToolApprovalRequest = {
										toolCallId: options.toolUseID,
										toolName,
										args: input,
										signal: options.signal,
										...(options.title ? { title: options.title } : {}),
										...(options.displayName
											? { displayName: options.displayName }
											: {}),
										...(options.description
											? { description: options.description }
											: {}),
										...(options.decisionReason
											? { decisionReason: options.decisionReason }
											: {}),
										...(options.blockedPath
											? { blockedPath: options.blockedPath }
											: {}),
										...(options.suggestions
											? { suggestions: options.suggestions }
											: {}),
									};
									const response = await args.requestToolApproval(request);
									return toClaudePermissionResult({ request, response });
								},
							}
						: {}),
					...permissionOptionsForMode(args.permissionMode),
					...thinkingOptionsForLevel(args.thinkingLevel),
				},
			});

			for await (const message of claudeQuery) {
				if (message.type === "stream_event") {
					const event = message.event as unknown;
					if (isRecord(event)) {
						const eventType = readRecordString(event, "type");
						const blockIndex =
							typeof event.index === "number" ? event.index : undefined;
						if (
							eventType === "content_block_start" &&
							blockIndex !== undefined
						) {
							const contentBlock = isRecord(event.content_block)
								? event.content_block
								: {};
							if (contentBlock.type === "tool_use") {
								const id = readRecordString(contentBlock, "id");
								const name = readRecordString(contentBlock, "name");
								if (id && name) {
									const toolArgs = isRecord(contentBlock.input)
										? contentBlock.input
										: {};
									toolNamesById.set(id, name);
									toolCallsByBlockIndex.set(blockIndex, {
										id,
										name,
										partialJson: "",
										args: toolArgs,
										lastEmittedArgsJson: JSON.stringify(toolArgs),
									});
									emitToolCallIfChanged({
										id,
										name,
										args: toolArgs,
									});
								}
							}
						}
						if (
							eventType === "content_block_delta" &&
							blockIndex !== undefined
						) {
							const delta = isRecord(event.delta) ? event.delta : {};
							if (delta.type === "input_json_delta") {
								const toolCall = toolCallsByBlockIndex.get(blockIndex);
								const partialJson = readRecordString(delta, "partial_json");
								if (toolCall && partialJson) {
									toolCall.partialJson += partialJson;
									toolCall.args = parsePartialJsonObject(toolCall.partialJson);
									const argsJson = JSON.stringify(toolCall.args);
									if (toolCall.lastEmittedArgsJson !== argsJson) {
										toolCall.lastEmittedArgsJson = argsJson;
										emitToolCallIfChanged({
											id: toolCall.id,
											name: toolCall.name,
											args: toolCall.args,
										});
									}
								}
							}
						}
					}
				}

				const delta = extractDeltaFromClaudeMessage(message);
				if (delta.text) {
					streamedText += delta.text;
					args.onEvent({ type: "text-delta", text: delta.text });
				}
				if (delta.reasoningText) {
					streamedReasoningText += delta.reasoningText;
					args.onEvent({
						type: "reasoning-delta",
						text: delta.reasoningText,
					});
				}

				const final = extractAssistantContentFromClaudeMessage(message);
				if (final.text) finalText = final.text;
				if (final.reasoningText) finalReasoningText = final.reasoningText;
				for (const toolCall of extractToolUseBlocksFromClaudeAssistantMessage(
					message,
				)) {
					toolNamesById.set(toolCall.id, toolCall.name);
					emitToolCallIfChanged({
						id: toolCall.id,
						name: toolCall.name,
						args: toolCall.args,
					});
				}
				for (const toolResult of extractToolResultBlocksFromClaudeUserMessage(
					message,
				)) {
					args.onEvent({
						type: "tool-result",
						id: toolResult.id,
						name: toolNamesById.get(toolResult.id),
						result: toolResult.result,
						...(toolResult.isError !== undefined
							? { isError: toolResult.isError }
							: {}),
					});
				}
				for (const event of extractTimelineEventsFromClaudeMessage(message)) {
					args.onEvent(event);
				}
				if (
					message.type === "result" &&
					message.is_error &&
					"errors" in message
				) {
					errors.push(...message.errors);
				}
				if (message.type === "assistant" && message.error) {
					errors.push(message.error);
				}
			}
		} finally {
			args.signal.removeEventListener("abort", abort);
		}

		if (errors.length > 0) {
			throw new Error(errors.join("\n"));
		}

		return {
			text: streamedText || finalText,
			reasoningText: streamedReasoningText || finalReasoningText,
		};
	}
}

export class StandaloneChatRuntimeManager {
	private readonly sessions = new Map<string, StandaloneSession>();

	constructor(
		private readonly apiClient: ApiClient,
		private readonly provider: StandaloneChatProvider = new ClaudeStandaloneChatProvider(),
		private readonly logger: StandaloneChatRuntimeLogger = defaultStandaloneRuntimeLogger,
	) {}

	private getSession(sessionId: string): StandaloneSession {
		const existing = this.sessions.get(sessionId);
		if (existing) return existing;
		const session: StandaloneSession = {
			sessionId,
			messages: [],
			isRunning: false,
			currentMessage: null,
			lastErrorMessage: null,
			abortController: null,
			pendingApproval: null,
			pendingApprovalResolvers: new Map(),
			titleSet: false,
			hydrated: false,
			lastHydratedAt: 0,
			hydrationPromise: null,
		};
		this.sessions.set(sessionId, session);
		return session;
	}

	private async hydrateSession(
		session: StandaloneSession,
		options?: { force?: boolean },
	): Promise<void> {
		if (session.hydrated && !options?.force) return;
		if (session.hydrationPromise) {
			await session.hydrationPromise;
			return;
		}

		session.hydrationPromise = withTimeout(
			this.apiClient.chat.listMessages.query({
				sessionId: session.sessionId,
			}),
			{
				timeoutMs: CLOUD_MESSAGE_HYDRATION_TIMEOUT_MS,
				message: "Timed out loading conversation history",
			},
		)
			.then((messages) => {
				session.messages = messages.map(normalizeStandaloneMessage);
				session.titleSet = session.messages.some(
					(message) =>
						message.role === "user" && textFromContent(message.content),
				);
				session.hydrated = true;
				session.lastHydratedAt = Date.now();
			})
			.finally(() => {
				session.hydrationPromise = null;
			});

		await session.hydrationPromise;
	}

	getDisplayState(sessionId: string) {
		const session = this.getSession(sessionId);
		return {
			isRunning: session.isRunning,
			currentMessage: session.currentMessage,
			pendingQuestion: null,
			pendingApproval: session.pendingApproval,
			pendingPlanApproval: null,
			activeTools: new Map(),
			toolInputBuffers: new Map(),
			activeSubagents: new Map(),
			errorMessage: session.lastErrorMessage,
		};
	}

	async listMessages(sessionId: string): Promise<StandaloneMessage[]> {
		const session = this.getSession(sessionId);
		if (!session.hydrated) {
			await this.hydrateSession(session);
			return session.messages;
		}

		const shouldRefresh =
			!session.isRunning &&
			Date.now() - session.lastHydratedAt > CLOUD_MESSAGE_REFRESH_INTERVAL_MS;
		if (shouldRefresh) {
			void this.hydrateSession(session, { force: true }).catch((error) => {
				console.warn(
					"[standalone-chat] Background conversation refresh failed:",
					error,
				);
			});
		}
		return session.messages;
	}

	abort(sessionId: string): void {
		const session = this.getSession(sessionId);
		session.abortController?.abort();
		for (const resolver of session.pendingApprovalResolvers.values()) {
			resolver.reject(new Error("Chat request was aborted."));
		}
		session.pendingApprovalResolvers.clear();
		session.pendingApproval = null;
		session.isRunning = false;
		session.currentMessage = null;
		session.abortController = null;
	}

	async respondToApproval(
		sessionId: string,
		payload: { decision: ToolApprovalDecision },
	): Promise<{ ok: true }> {
		const session = this.getSession(sessionId);
		const pendingApproval = session.pendingApproval;
		if (!pendingApproval?.toolCallId) {
			throw new Error("No pending tool approval is available for this chat.");
		}
		const resolver = session.pendingApprovalResolvers.get(
			pendingApproval.toolCallId,
		);
		if (!resolver) {
			session.pendingApproval = null;
			throw new Error("The pending tool approval is no longer active.");
		}
		session.pendingApprovalResolvers.delete(pendingApproval.toolCallId);
		session.pendingApproval = null;
		resolver.resolve({
			decision: payload.decision,
			...(payload.decision === "always_allow_category" && resolver.suggestions
				? { suggestions: resolver.suggestions }
				: {}),
		});
		return { ok: true };
	}

	private async resolveClaudeProviderRuntimeConfig(
		metadata: SendMessageInput["metadata"],
	): Promise<ClaudeProviderRuntimeConfig | null> {
		const providerId = metadata?.modelProviderId?.trim();
		if (!providerId) return null;

		const providers = await this.apiClient.modelProvider.syncPayload.query();
		const provider = providers.find((item) => item.id === providerId);
		if (!provider || !provider.enabled) {
			throw new Error(
				"Selected model provider is unavailable. Please choose another model.",
			);
		}
		const secret = provider.secret?.trim();
		if (!secret) {
			throw new Error(
				"Selected model provider is missing credentials. Please update Models settings.",
			);
		}
		const modelId = metadata?.model?.trim();
		if (
			modelId &&
			!provider.models.some(
				(model) => model.enabled && model.modelId.trim() === modelId,
			)
		) {
			throw new Error(
				"Selected model is no longer enabled for this provider. Please choose another model.",
			);
		}

		const env = buildClaudeProviderEnv({
			provider: { baseUrl: provider.baseUrl, secret },
			modelId,
		});
		return {
			provider: {
				id: provider.id,
				name: provider.name,
				protocol: provider.protocol,
				baseUrl: provider.baseUrl,
			},
			env,
		};
	}

	async sendMessage(input: SendMessageInput): Promise<void> {
		const session = this.getSession(input.sessionId);
		await this.hydrateSession(session);
		if (session.isRunning) {
			throw new Error("A response is already running for this chat.");
		}

		const userText = input.payload.content.trim();
		const userMessage: StandaloneMessage = {
			id: randomId("user"),
			role: "user",
			content: [
				...(input.payload.files ?? []).map((file) => ({
					type: "file" as const,
					data: file.data,
					mediaType: file.mediaType,
					...(file.filename ? { filename: file.filename } : {}),
				})),
				...(userText ? [{ type: "text" as const, text: userText }] : []),
			],
			createdAt: new Date(),
		};
		session.messages.push(userMessage);
		await this.persistMessage(input.sessionId, userMessage);
		session.isRunning = true;
		session.currentMessage = null;
		session.lastErrorMessage = null;
		const abortController = new AbortController();
		session.abortController = abortController;
		const startedAt = Date.now();
		const eventCounters = {
			textDeltas: 0,
			reasoningDeltas: 0,
			toolCalls: 0,
			toolResults: 0,
			permissionDenied: 0,
			toolProgress: 0,
			subagentEvents: 0,
		};
		const toolNamesSeen: string[] = [];
		if (!session.titleSet && userText) {
			session.titleSet = true;
			void this.generateAndUpdateTitle({
				sessionId: input.sessionId,
				userText,
			});
		}

		try {
			const chatCwd = ensureStandaloneChatCwd(input.sessionId);
			const providerRuntimeConfig =
				await this.resolveClaudeProviderRuntimeConfig(input.metadata);
			if (providerRuntimeConfig) {
				writeClaudeSettingsLocal({
					cwd: chatCwd,
					env: providerRuntimeConfig.env,
				});
			}
			this.logger.info?.("[standalone-chat] Claude turn started", {
				sessionId: input.sessionId,
				prompt: userText,
				model: input.metadata?.model,
				modelProviderId: providerRuntimeConfig?.provider.id,
				modelProviderName: providerRuntimeConfig?.provider.name,
				modelProviderProtocol: providerRuntimeConfig?.provider.protocol,
				modelProviderBaseUrl: providerRuntimeConfig?.provider.baseUrl,
				permissionMode: input.metadata?.permissionMode,
				thinkingLevel: input.metadata?.thinkingLevel,
				maxTurns: STANDALONE_CHAT_CLAUDE_MAX_TURNS ?? "unbounded",
				cwd: chatCwd,
				historyMessages: session.messages.length,
				userTextLength: userText.length,
				fileCount: input.payload.files?.length ?? 0,
			});

			const assistantMessage: StandaloneMessage = {
				id: randomId("assistant"),
				role: "assistant",
				content: buildTurnMetadataParts({
					modelId: input.metadata?.model,
					modelProviderName:
						providerRuntimeConfig?.provider.name ??
						input.metadata?.modelProviderName,
					permissionMode: input.metadata?.permissionMode,
					userMessage,
				}),
				createdAt: new Date(),
			};
			session.currentMessage = assistantMessage;
			const providerMessages = await this.createProviderMessagesWithContext({
				messages: session.messages,
				signal: abortController.signal,
			});
			const response = await this.provider.sendTurn({
				modelId: input.metadata?.model,
				cwd: chatCwd,
				env: buildStandaloneClaudeProcessEnv({
					cwd: chatCwd,
					providerEnv: providerRuntimeConfig?.env,
				}),
				...(providerRuntimeConfig
					? { modelProvider: providerRuntimeConfig.provider }
					: {}),
				thinkingLevel: input.metadata?.thinkingLevel,
				permissionMode: input.metadata?.permissionMode,
				messages: providerMessages,
				signal: abortController.signal,
				requestToolApproval: (request) =>
					this.requestToolApproval(session, request),
				onEvent: (event) => {
					if (event.type === "text-delta") {
						eventCounters.textDeltas += 1;
						appendTextPart(assistantMessage, "text", event.text);
					}
					if (event.type === "reasoning-delta") {
						eventCounters.reasoningDeltas += 1;
						appendTextPart(assistantMessage, "reasoning", event.text);
					}
					if (event.type === "tool-call") {
						eventCounters.toolCalls += 1;
						if (!toolNamesSeen.includes(event.name)) {
							toolNamesSeen.push(event.name);
						}
						appendOrUpdateToolCallPart(assistantMessage, event);
					}
					if (event.type === "tool-result") {
						eventCounters.toolResults += 1;
						appendOrUpdateToolResultPart(assistantMessage, event);
					}
					if (event.type === "permission-denied") {
						eventCounters.permissionDenied += 1;
						appendOrUpdatePermissionResolvedPart(assistantMessage, {
							toolCallId: event.id,
							toolName: event.name,
							decision: "denied",
							message: event.message,
						});
					}
					if (event.type === "tool-progress") {
						eventCounters.toolProgress += 1;
						if (!toolNamesSeen.includes(event.name)) {
							toolNamesSeen.push(event.name);
						}
						appendOrUpdateToolProgressPart(assistantMessage, event);
					}
					if (event.type === "subagent-event") {
						eventCounters.subagentEvents += 1;
						appendOrUpdateSubagentEventPart(assistantMessage, event);
					}
				},
			});
			const reasoningText =
				response.reasoningText ||
				reasoningFromContent(assistantMessage.content);
			const existingAssistantText = textFromContent(assistantMessage.content);
			const assistantText = response.text || existingAssistantText;
			if (
				reasoningText &&
				!assistantMessage.content.some((part) => part.type === "reasoning")
			) {
				assistantMessage.content.unshift({
					type: "reasoning",
					text: reasoningText,
				});
			}
			if (assistantText && !existingAssistantText) {
				assistantMessage.content.push({ type: "text", text: assistantText });
			}
			if (assistantMessage.content.length === 0) {
				assistantMessage.content.push({
					type: "text",
					text: "(empty response)",
				});
			}
			assistantMessage.stopReason = "end_turn";
			session.messages.push(assistantMessage);
			await this.persistMessage(input.sessionId, assistantMessage);
			void this.apiClient.chat.updateSession.mutate({
				sessionId: input.sessionId,
				lastActiveAt: new Date(),
			});
			this.logger.info?.("[standalone-chat] Claude turn completed", {
				sessionId: input.sessionId,
				prompt: userText,
				model: input.metadata?.model,
				permissionMode: input.metadata?.permissionMode,
				durationMs: Date.now() - startedAt,
				textDeltas: eventCounters.textDeltas,
				reasoningDeltas: eventCounters.reasoningDeltas,
				toolCalls: eventCounters.toolCalls,
				toolResults: eventCounters.toolResults,
				toolProgress: eventCounters.toolProgress,
				subagentEvents: eventCounters.subagentEvents,
				toolNames: toolNamesSeen.join(","),
				assistantContentParts: assistantMessage.content.length,
			});
		} catch (error) {
			const normalizedError = normalizeStandaloneRuntimeError(error);
			const message = normalizedError.message;
			this.logger.error?.("[standalone-chat] Claude turn failed", {
				sessionId: input.sessionId,
				prompt: userText,
				model: input.metadata?.model,
				permissionMode: input.metadata?.permissionMode,
				maxTurns: STANDALONE_CHAT_CLAUDE_MAX_TURNS ?? "unbounded",
				durationMs: Date.now() - startedAt,
				textDeltas: eventCounters.textDeltas,
				reasoningDeltas: eventCounters.reasoningDeltas,
				toolCalls: eventCounters.toolCalls,
				toolResults: eventCounters.toolResults,
				toolProgress: eventCounters.toolProgress,
				subagentEvents: eventCounters.subagentEvents,
				toolNames: toolNamesSeen.join(","),
				rawErrorName: error instanceof Error ? error.name : typeof error,
				rawErrorMessage:
					error instanceof Error
						? error.message
						: "Failed to send chat message",
				rawErrorStack: error instanceof Error ? error.stack : undefined,
				normalizedErrorMessage: message,
			});
			session.lastErrorMessage = message;
			const assistantErrorMessage: StandaloneMessage = {
				id: randomId("assistant-error"),
				role: "assistant",
				content: [{ type: "text", text: message }],
				createdAt: new Date(),
				stopReason: abortController.signal.aborted ? "aborted" : "error",
				errorMessage: message,
			};
			session.messages.push(assistantErrorMessage);
			await this.persistMessage(input.sessionId, assistantErrorMessage).catch(
				(persistError) => {
					console.warn(
						"[standalone-chat] Failed to persist error message:",
						persistError,
					);
				},
			);
			throw normalizedError;
		} finally {
			for (const resolver of session.pendingApprovalResolvers.values()) {
				resolver.reject(new Error("Chat request finished before approval."));
			}
			session.pendingApprovalResolvers.clear();
			session.pendingApproval = null;
			session.isRunning = false;
			session.currentMessage = null;
			session.abortController = null;
		}
	}

	async restartFromMessage(input: SendMessageInput & { messageId: string }) {
		const session = this.getSession(input.sessionId);
		await this.hydrateSession(session);
		const index = session.messages.findIndex(
			(message) => message.id === input.messageId,
		);
		if (index === -1) {
			throw new Error("The selected message is no longer available to edit");
		}
		if (session.messages[index]?.role !== "user") {
			throw new Error("Only user messages can be edited or resent");
		}
		await this.apiClient.chat.deleteMessagesFrom.mutate({
			sessionId: input.sessionId,
			messageId: input.messageId,
		});
		session.messages = session.messages.slice(0, index);
		await this.sendMessage(input);
	}

	private async persistMessage(
		sessionId: string,
		message: StandaloneMessage,
	): Promise<void> {
		await this.apiClient.chat.appendMessage.mutate({
			id: message.id,
			sessionId,
			role: message.role,
			content: message.content,
			createdAt: message.createdAt,
			...(message.stopReason ? { stopReason: message.stopReason } : {}),
			...(message.errorMessage ? { errorMessage: message.errorMessage } : {}),
		});
		const session = this.sessions.get(sessionId);
		if (session) {
			session.lastHydratedAt = Date.now();
		}
	}

	private requestToolApproval(
		session: StandaloneSession,
		request: StandaloneToolApprovalRequest,
	): Promise<StandaloneToolApprovalResponse> {
		if (session.currentMessage) {
			appendOrUpdatePermissionRequestedPart(session.currentMessage, request);
		}
		session.pendingApproval = {
			toolCallId: request.toolCallId,
			toolName: request.toolName,
			args: request.args,
			...(request.title ? { title: request.title } : {}),
			...(request.displayName ? { displayName: request.displayName } : {}),
			...(request.description ? { description: request.description } : {}),
			...(request.decisionReason
				? { decisionReason: request.decisionReason }
				: {}),
			...(request.blockedPath ? { blockedPath: request.blockedPath } : {}),
		};
		return new Promise<StandaloneToolApprovalResponse>((resolve, reject) => {
			const cleanup = () => {
				request.signal.removeEventListener("abort", onAbort);
			};
			const onAbort = () => {
				cleanup();
				session.pendingApprovalResolvers.delete(request.toolCallId);
				if (session.pendingApproval?.toolCallId === request.toolCallId) {
					session.pendingApproval = null;
				}
				reject(new Error("Tool approval request was aborted."));
			};
			session.pendingApprovalResolvers.set(request.toolCallId, {
				resolve: (response) => {
					if (session.currentMessage) {
						appendOrUpdatePermissionResolvedPart(session.currentMessage, {
							toolCallId: request.toolCallId,
							toolName: request.toolName,
							decision: response.decision,
							...(response.decision === "decline"
								? { message: "User declined the tool request." }
								: {}),
						});
					}
					cleanup();
					resolve(response);
				},
				reject: (error) => {
					cleanup();
					reject(error);
				},
				...(request.suggestions ? { suggestions: request.suggestions } : {}),
			});
			if (request.signal.aborted) {
				onAbort();
				return;
			}
			request.signal.addEventListener("abort", onAbort, { once: true });
		});
	}

	private async generateAndUpdateTitle(args: {
		sessionId: string;
		userText: string;
	}): Promise<void> {
		const title = fallbackTitleFromMessage(args.userText);
		await this.updateSessionTitle(args.sessionId, title);
	}

	private async updateSessionTitle(
		sessionId: string,
		title: string,
	): Promise<void> {
		try {
			await this.apiClient.chat.updateTitle.mutate({
				sessionId,
				title,
			});
		} catch (error) {
			console.warn("[standalone-chat] Title update failed:", error);
		}
	}

	private async createProviderMessagesWithContext(args: {
		messages: StandaloneMessage[];
		signal: AbortSignal;
	}): Promise<ProviderMessage[]> {
		const providerMessages = toProviderMessages(args.messages);
		const latestUserMessage = [...args.messages]
			.reverse()
			.find((message) => message.role === "user");
		if (!latestUserMessage) return providerMessages;

		const urls = extractHttpUrls(textFromContent(latestUserMessage.content));
		if (urls.length === 0) return providerMessages;

		const contexts = await Promise.all(
			urls.map((url) => fetchWebContext({ url, signal: args.signal })),
		);
		const webContextPrompt = buildWebContextPrompt(contexts);
		if (!webContextPrompt) return providerMessages;

		return [
			{
				role: "system",
				content: webContextPrompt,
			},
			...providerMessages,
		];
	}
}
