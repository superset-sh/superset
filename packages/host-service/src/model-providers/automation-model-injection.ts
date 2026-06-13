import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { automationAgentModelConfigs } from "../db/schema";
import type { ResolvedHostAgentConfig } from "../trpc/router/agents/agents";
import {
	type ClaudeModelEnvKey,
	writeClaudeSettingsLocalJson,
} from "./claude-settings";
import { getModelProvider } from "./storage";

export interface AutomationModelSelection {
	providerId: string;
	modelId: string;
	config?: Record<string, unknown>;
}

export interface AutomationModelInjectionResult {
	env: Record<string, string>;
	family: AutomationModelFamily;
	configPath: string | null;
}

export type AutomationModelFamily = "claude" | "codex" | "gemini" | "opencode";

const SUPPORTED_FAMILIES = new Set<string>([
	"claude",
	"codex",
	"gemini",
	"opencode",
]);

export function automationModelFamilyForPreset(
	presetId: string,
): AutomationModelFamily | null {
	return SUPPORTED_FAMILIES.has(presetId)
		? (presetId as AutomationModelFamily)
		: null;
}

export function supportsAutomationModelSelection(presetId: string): boolean {
	return automationModelFamilyForPreset(presetId) !== null;
}

function randomGatewayToken(): string {
	return `superset_${randomBytes(24).toString("base64url")}`;
}

function normalizeOriginOrV1Url(baseUrl: string): string {
	const trimmed = baseUrl.trim().replace(/\/+$/, "");
	if (/\/v1$/i.test(trimmed)) return trimmed;
	const withoutScheme = trimmed.split("://")[1] ?? trimmed;
	if (!withoutScheme.includes("/")) return `${trimmed}/v1`;
	return trimmed;
}

function escapeTomlString(value: string): string {
	return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function serializeEnvFile(env: Record<string, string>): string {
	return `${Object.keys(env)
		.sort()
		.map((key) => `${key}=${env[key] ?? ""}`)
		.join("\n")}\n`;
}

function writeJsonFile(path: string, value: unknown): void {
	writeFileSync(path, `${JSON.stringify(value, null, "\t")}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
}

function assertSelectedProvider(args: {
	db: HostDb;
	selection: AutomationModelSelection;
}) {
	const provider = getModelProvider(args.db, args.selection.providerId);
	if (!provider) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Model provider not found",
		});
	}
	if (!provider.enabled) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Model provider is disabled",
		});
	}
	if (!provider.secret) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Model provider credential is required",
		});
	}

	const selectedModel = provider.models.find(
		(model) => model.enabled && model.modelId === args.selection.modelId,
	);
	if (!selectedModel) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Model is not configured for provider",
		});
	}

	return { provider: { ...provider, secret: provider.secret }, selectedModel };
}

function upsertAutomationGatewayConfig(args: {
	db: HostDb;
	automationId: string;
	agent: string;
	providerId: string;
	modelId: string;
}): string {
	const existing = args.db
		.select()
		.from(automationAgentModelConfigs)
		.where(
			and(
				eq(automationAgentModelConfigs.automationId, args.automationId),
				eq(automationAgentModelConfigs.agent, args.agent),
			),
		)
		.get();
	const gatewayToken = existing?.gatewayToken ?? randomGatewayToken();
	const now = Date.now();
	args.db
		.insert(automationAgentModelConfigs)
		.values({
			id: existing?.id ?? randomUUID(),
			automationId: args.automationId,
			agent: args.agent,
			providerId: args.providerId,
			gatewayToken,
			modelId: args.modelId,
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [
				automationAgentModelConfigs.automationId,
				automationAgentModelConfigs.agent,
			],
			set: {
				providerId: args.providerId,
				gatewayToken,
				modelId: args.modelId,
				updatedAt: now,
			},
		})
		.run();
	return gatewayToken;
}

function claudeEnv(args: {
	gatewayToken: string;
	gatewayBaseUrl: string;
	modelId: string;
}): Record<ClaudeModelEnvKey, string> {
	return {
		ANTHROPIC_AUTH_TOKEN: args.gatewayToken,
		ANTHROPIC_BASE_URL: args.gatewayBaseUrl,
		API_TIMEOUT_MS: "3000000",
		CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
		ANTHROPIC_MODEL: args.modelId,
		ANTHROPIC_DEFAULT_HAIKU_MODEL: args.modelId,
		ANTHROPIC_DEFAULT_SONNET_MODEL: args.modelId,
		ANTHROPIC_DEFAULT_OPUS_MODEL: args.modelId,
		CLAUDE_CODE_DISABLE_1M_CONTEXT: "1",
	};
}

function writeClaudeAutomationConfig(args: {
	db: HostDb;
	automationId: string;
	agent: string;
	runDirectory: string;
	hostServiceBaseUrl: string;
	selection: AutomationModelSelection;
}): AutomationModelInjectionResult {
	const gatewayToken = upsertAutomationGatewayConfig({
		db: args.db,
		automationId: args.automationId,
		agent: args.agent,
		providerId: args.selection.providerId,
		modelId: args.selection.modelId,
	});
	const gatewayBaseUrl = `${args.hostServiceBaseUrl}/model-gateway`;
	const result = writeClaudeSettingsLocalJson({
		worktreePath: args.runDirectory,
		env: claudeEnv({
			gatewayToken,
			gatewayBaseUrl,
			modelId: args.selection.modelId,
		}),
	});
	return { env: {}, family: "claude", configPath: result.settingsPath };
}

function writeCodexAutomationConfig(args: {
	runDirectory: string;
	providerName: string;
	baseUrl: string;
	secret: string;
	modelId: string;
}): AutomationModelInjectionResult {
	const codexHome = join(args.runDirectory, ".codex");
	mkdirSync(codexHome, { recursive: true, mode: 0o700 });
	writeJsonFile(join(codexHome, "auth.json"), {
		OPENAI_API_KEY: args.secret,
	});
	const configPath = join(codexHome, "config.toml");
	const model = escapeTomlString(args.modelId);
	const baseUrl = escapeTomlString(normalizeOriginOrV1Url(args.baseUrl));
	const providerName = escapeTomlString(args.providerName);
	writeFileSync(
		configPath,
		`model_provider = "superset"\nmodel = "${model}"\nmodel_reasoning_effort = "high"\ndisable_response_storage = true\n\n[model_providers.superset]\nname = "${providerName}"\nbase_url = "${baseUrl}"\nwire_api = "responses"\nrequires_openai_auth = true\n`,
		{ encoding: "utf8", mode: 0o600 },
	);
	return {
		env: {
			CODEX_HOME: codexHome,
			OPENAI_API_KEY: args.secret,
		},
		family: "codex",
		configPath,
	};
}

function writeGeminiAutomationConfig(args: {
	runDirectory: string;
	baseUrl: string;
	secret: string;
	modelId: string;
}): AutomationModelInjectionResult {
	const geminiDir = join(args.runDirectory, ".gemini");
	mkdirSync(geminiDir, { recursive: true, mode: 0o700 });
	const env = {
		GEMINI_API_KEY: args.secret,
		GEMINI_MODEL: args.modelId,
		GOOGLE_API_KEY: args.secret,
		GOOGLE_GEMINI_BASE_URL: args.baseUrl,
	};
	const configPath = join(geminiDir, ".env");
	writeFileSync(configPath, serializeEnvFile(env), {
		encoding: "utf8",
		mode: 0o600,
	});
	return {
		env: {
			...env,
			GEMINI_CONFIG_DIR: geminiDir,
		},
		family: "gemini",
		configPath,
	};
}

function writeOpenCodeAutomationConfig(args: {
	runDirectory: string;
	providerName: string;
	baseUrl: string;
	secret: string;
	modelId: string;
	modelName: string;
}): AutomationModelInjectionResult {
	const configDir = join(args.runDirectory, ".config", "opencode");
	mkdirSync(configDir, { recursive: true, mode: 0o700 });
	const configPath = join(configDir, "opencode.json");
	writeJsonFile(configPath, {
		$schema: "https://opencode.ai/config.json",
		provider: {
			superset: {
				npm: "@ai-sdk/openai-compatible",
				name: args.providerName,
				options: {
					baseURL: normalizeOriginOrV1Url(args.baseUrl),
					apiKey: args.secret,
				},
				models: {
					[args.modelId]: {
						name: args.modelName,
					},
				},
			},
		},
		model: `superset/${args.modelId}`,
		small_model: `superset/${args.modelId}`,
		enabled_providers: ["superset"],
	});
	return {
		env: {
			OPENCODE_CONFIG_DIR: configDir,
		},
		family: "opencode",
		configPath,
	};
}

export function prepareAutomationModelInjection(args: {
	db: HostDb;
	config: ResolvedHostAgentConfig;
	automationId: string;
	runDirectory: string;
	hostServiceBaseUrl: string;
	selection?: AutomationModelSelection;
}): AutomationModelInjectionResult | null {
	if (!args.selection) return null;

	const family = automationModelFamilyForPreset(args.config.presetId);
	if (!family) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Model selection is not supported for this runner",
		});
	}

	const { provider, selectedModel } = assertSelectedProvider({
		db: args.db,
		selection: args.selection,
	});

	if (family === "claude") {
		return writeClaudeAutomationConfig({
			db: args.db,
			automationId: args.automationId,
			agent: args.config.presetId,
			runDirectory: args.runDirectory,
			hostServiceBaseUrl: args.hostServiceBaseUrl,
			selection: args.selection,
		});
	}
	if (family === "codex") {
		return writeCodexAutomationConfig({
			runDirectory: args.runDirectory,
			providerName: provider.name,
			baseUrl: provider.baseUrl,
			secret: provider.secret,
			modelId: args.selection.modelId,
		});
	}
	if (family === "gemini") {
		return writeGeminiAutomationConfig({
			runDirectory: args.runDirectory,
			baseUrl: provider.baseUrl,
			secret: provider.secret,
			modelId: args.selection.modelId,
		});
	}
	return writeOpenCodeAutomationConfig({
		runDirectory: args.runDirectory,
		providerName: provider.name,
		baseUrl: provider.baseUrl,
		secret: provider.secret,
		modelId: args.selection.modelId,
		modelName: selectedModel.displayName,
	});
}

export function modelProtocolsForAutomationFamily(
	family: AutomationModelFamily | null,
): Array<"anthropic" | "openai-chat" | "openai-responses"> | null {
	if (!family) return null;
	if (family === "claude")
		return ["anthropic", "openai-chat", "openai-responses"];
	if (family === "gemini")
		return ["anthropic", "openai-chat", "openai-responses"];
	return ["openai-chat", "openai-responses"];
}
