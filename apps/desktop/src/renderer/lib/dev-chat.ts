import type { ModelOption } from "renderer/components/Chat/ChatInterface/types";
import { env } from "renderer/env.renderer";
import { MOCK_ORG_ID } from "shared/constants";

export const DEV_CHAT_MODELS: ModelOption[] = [
	{
		id: "anthropic/claude-opus-4-6",
		name: "Opus 4.6",
		provider: "Anthropic",
	},
	{
		id: "anthropic/claude-sonnet-4-6",
		name: "Sonnet 4.6",
		provider: "Anthropic",
	},
	{
		id: "anthropic/claude-haiku-4-5",
		name: "Haiku 4.5",
		provider: "Anthropic",
	},
	{
		id: "openai/gpt-5.4",
		name: "GPT-5.4",
		provider: "OpenAI",
	},
	{
		id: "openai/gpt-5.3-codex",
		name: "GPT-5.3 Codex",
		provider: "OpenAI",
	},
];

export function isDesktopChatDevMode(
	skipEnvValidation = env.SKIP_ENV_VALIDATION,
): boolean {
	return skipEnvValidation;
}

export function resolveDesktopChatOrganizationId(
	activeOrganizationId: string | null | undefined,
	skipEnvValidation = env.SKIP_ENV_VALIDATION,
): string | null {
	if (skipEnvValidation) return MOCK_ORG_ID;
	return activeOrganizationId ?? null;
}

export function isDesktopChatSessionReady({
	sessionId,
	hasPersistedSession,
	skipEnvValidation = env.SKIP_ENV_VALIDATION,
}: {
	sessionId: string | null;
	hasPersistedSession: boolean;
	skipEnvValidation?: boolean;
}): boolean {
	if (skipEnvValidation) return Boolean(sessionId);
	return hasPersistedSession;
}

export function getDesktopChatModelOptions(
	skipEnvValidation = env.SKIP_ENV_VALIDATION,
): ModelOption[] {
	return skipEnvValidation ? DEV_CHAT_MODELS : [];
}
