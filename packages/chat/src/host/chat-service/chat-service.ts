import Anthropic from "@anthropic-ai/sdk";
import {
	getAnthropicAuthToken,
	setAnthropicOAuthCredentials,
} from "@superset/agent";
import { createMastraCode } from "mastracode";
import {
	createAnthropicOAuthSession,
	exchangeAnthropicAuthorizationCode,
} from "../auth/anthropic";
import type { GetHeaders } from "../lib/auth/auth";
import { AgentManager, type AgentManagerConfig } from "./agent-manager";

export type ChatLifecycleEventType = "Start" | "PermissionRequest" | "Stop";
type OpenAIAuthMethod = "api_key" | "env_api_key" | "oauth" | null;
const OPENAI_AUTH_PROVIDER_ID = "openai-codex";
type OpenAIAuthStorage = Awaited<
	ReturnType<typeof createMastraCode>
>["authStorage"];

export interface ChatLifecycleEvent {
	sessionId: string;
	eventType: ChatLifecycleEventType;
}

export interface ChatServiceHostConfig {
	deviceId: string;
	apiUrl: string;
	getHeaders: GetHeaders;
	onLifecycleEvent?: (event: ChatLifecycleEvent) => void;
}

export class ChatService {
	private agentManager: AgentManager | null = null;
	private hostConfig: ChatServiceHostConfig;
	private anthropicAuthSession: {
		verifier: string;
		state: string;
		createdAt: number;
	} | null = null;
	private openAIAuthStoragePromise: Promise<OpenAIAuthStorage> | null = null;
	private static readonly ANTHROPIC_AUTH_SESSION_TTL_MS = 10 * 60 * 1000;

	constructor(hostConfig: ChatServiceHostConfig) {
		this.hostConfig = hostConfig;
	}

	async start(options: { organizationId: string }): Promise<void> {
		const config: AgentManagerConfig = {
			deviceId: this.hostConfig.deviceId,
			organizationId: options.organizationId,
			apiUrl: this.hostConfig.apiUrl,
			getHeaders: this.hostConfig.getHeaders,
			onLifecycleEvent: (event) => {
				this.hostConfig.onLifecycleEvent?.(event);
				if (event.eventType === "Stop") {
					void this.maybeGenerateTitle(event.sessionId);
				}
			},
		};

		if (this.agentManager) {
			await this.agentManager.restart({
				organizationId: options.organizationId,
				deviceId: this.hostConfig.deviceId,
			});
		} else {
			this.agentManager = new AgentManager(config);
			await this.agentManager.start();
		}
	}

	stop(): void {
		if (this.agentManager) {
			this.agentManager.stop();
			this.agentManager = null;
		}
	}

	hasWatcher(sessionId: string): boolean {
		return this.agentManager?.hasWatcher(sessionId) ?? false;
	}

	async ensureWatcher(
		sessionId: string,
		cwd?: string,
	): Promise<{ ready: boolean; reason?: string }> {
		if (!this.agentManager) {
			return { ready: false, reason: "Chat service is not started" };
		}
		return this.agentManager.ensureWatcher(sessionId, cwd);
	}

	getAnthropicAuthStatus(): { authenticated: boolean } {
		return { authenticated: Boolean(getAnthropicAuthToken()) };
	}

	async getOpenAIAuthStatus(): Promise<{
		authenticated: boolean;
		method: OpenAIAuthMethod;
	}> {
		const method = await this.resolveOpenAIAuthMethod();
		return { authenticated: method !== null, method };
	}

	async setOpenAIApiKey(input: { apiKey: string }): Promise<{ success: true }> {
		const trimmedApiKey = input.apiKey.trim();
		if (trimmedApiKey.length === 0) {
			throw new Error("OpenAI API key is required");
		}

		const authStorage = await this.getOpenAIAuthStorage();
		authStorage.reload();
		authStorage.set(OPENAI_AUTH_PROVIDER_ID, {
			type: "api_key",
			key: trimmedApiKey,
		});

		process.env.OPENAI_API_KEY = trimmedApiKey;
		return { success: true };
	}

	async clearOpenAIApiKey(): Promise<{ success: true }> {
		const authStorage = await this.getOpenAIAuthStorage();
		authStorage.reload();
		const credential = authStorage.get(OPENAI_AUTH_PROVIDER_ID);
		if (credential?.type !== "api_key") {
			return { success: true };
		}

		authStorage.remove(OPENAI_AUTH_PROVIDER_ID);
		if (process.env.OPENAI_API_KEY?.trim() === credential.key.trim()) {
			delete process.env.OPENAI_API_KEY;
		}

		return { success: true };
	}

	private async resolveOpenAIAuthMethod(): Promise<OpenAIAuthMethod> {
		const authStorage = await this.getOpenAIAuthStorage();
		authStorage.reload();
		const credential = authStorage.get(OPENAI_AUTH_PROVIDER_ID);
		if (credential?.type === "oauth") {
			return "oauth";
		}
		if (credential?.type === "api_key" && credential.key.trim().length > 0) {
			return "api_key";
		}
		if (process.env.OPENAI_API_KEY?.trim()) {
			return "env_api_key";
		}
		return null;
	}

	private async getOpenAIAuthStorage(): Promise<OpenAIAuthStorage> {
		if (!this.openAIAuthStoragePromise) {
			this.openAIAuthStoragePromise = createMastraCode({
				disableMcp: true,
				disableHooks: true,
			})
				.then((runtime) => runtime.authStorage)
				.catch((error) => {
					this.openAIAuthStoragePromise = null;
					throw error;
				});
		}
		return this.openAIAuthStoragePromise;
	}

	startAnthropicOAuth(): { url: string; instructions: string } {
		const session = createAnthropicOAuthSession();
		this.anthropicAuthSession = {
			verifier: session.verifier,
			state: session.state,
			createdAt: session.createdAt,
		};

		return {
			url: session.authUrl,
			instructions:
				"Authorize Anthropic in your browser, then paste the code shown there (format: code#state).",
		};
	}

	cancelAnthropicOAuth(): { success: true } {
		this.anthropicAuthSession = null;
		return { success: true };
	}

	async completeAnthropicOAuth(input: {
		code: string;
	}): Promise<{ success: true; expiresAt: number }> {
		if (!this.anthropicAuthSession) {
			throw new Error("No active Anthropic auth session. Start auth again.");
		}

		const elapsed = Date.now() - this.anthropicAuthSession.createdAt;
		if (elapsed > ChatService.ANTHROPIC_AUTH_SESSION_TTL_MS) {
			this.anthropicAuthSession = null;
			throw new Error(
				"Anthropic auth session expired. Start auth again and paste a fresh code.",
			);
		}

		const session = this.anthropicAuthSession;
		this.anthropicAuthSession = null;

		const credentials = await exchangeAnthropicAuthorizationCode({
			rawCode: input.code,
			verifier: session.verifier,
			expectedState: session.state,
		});

		setAnthropicOAuthCredentials(credentials);
		return { success: true, expiresAt: credentials.expiresAt };
	}

	private async maybeGenerateTitle(sessionId: string): Promise<void> {
		const watcher = this.agentManager?.getWatcher(sessionId);
		if (!watcher) return;

		const host = watcher.sessionHost;
		const messages = host.getMessageDigest();
		if (messages.length === 0) return;

		const userCount = messages.filter((m) => m.role === "user").length;
		if (userCount !== 1 && userCount % 10 !== 0) return;

		const { title } = await this.generateTitle(messages);
		await host.postTitle(title);
	}

	private async generateTitle(
		messages: { role: string; text: string }[],
	): Promise<{ title: string }> {
		const authToken = getAnthropicAuthToken();
		if (!authToken) {
			const firstUser = messages.find((m) => m.role === "user");
			return { title: firstUser?.text.slice(0, 40).trim() || "Untitled Chat" };
		}

		const digest = messages.map((m) => `${m.role}: ${m.text}`).join("\n");
		const client = new Anthropic({
			authToken,
			defaultHeaders: {
				"anthropic-beta": "oauth-2025-04-20",
			},
		});

		const response = await client.messages.create({
			model: "claude-haiku-4-5-20251001",
			max_tokens: 30,
			system:
				"Generate a concise 2-5 word title for this coding chat. Respond with just the title, nothing else.",
			messages: [{ role: "user", content: digest }],
		});

		const text =
			response.content[0]?.type === "text"
				? response.content[0].text.trim()
				: null;
		return { title: text || "Untitled Chat" };
	}
}
