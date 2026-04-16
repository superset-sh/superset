import type { LanguageModel } from "@mastra/core/llm";
import { createAuthStorage, createMastraCode } from "mastracode";

const ANTHROPIC_SMALL_MODEL_ID = "anthropic/claude-haiku-4-5-20251001";
const OPENAI_SMALL_MODEL_ID = "openai/gpt-4o-mini";

const ANTHROPIC_AUTH_PROVIDER_ID = "anthropic";
const OPENAI_AUTH_PROVIDER_ID = "openai";

type MastraCodeRuntime = Awaited<ReturnType<typeof createMastraCode>>;
type ResolveModel = MastraCodeRuntime["resolveModel"];

let resolverPromise: Promise<ResolveModel> | null = null;

function getResolver(): Promise<ResolveModel> {
	if (!resolverPromise) {
		resolverPromise = createMastraCode({
			disableMcp: true,
			disableHooks: true,
		}).then((runtime) => runtime.resolveModel);
	}
	return resolverPromise;
}

function pickSmallModelId(): string | null {
	const authStorage = createAuthStorage();
	authStorage.reload();
	const hasAnthropicApiKey = !!(
		process.env.ANTHROPIC_API_KEY ||
		authStorage.hasStoredApiKey(ANTHROPIC_AUTH_PROVIDER_ID)
	);
	const hasAnthropicOAuth = authStorage.isLoggedIn(ANTHROPIC_AUTH_PROVIDER_ID);
	if (hasAnthropicApiKey || hasAnthropicOAuth) {
		return ANTHROPIC_SMALL_MODEL_ID;
	}
	const hasOpenAIApiKey = !!(
		process.env.OPENAI_API_KEY ||
		authStorage.hasStoredApiKey(OPENAI_AUTH_PROVIDER_ID)
	);
	const hasOpenAIOAuth = authStorage.isLoggedIn(OPENAI_AUTH_PROVIDER_ID);
	if (hasOpenAIApiKey || hasOpenAIOAuth) {
		return OPENAI_SMALL_MODEL_ID;
	}
	return null;
}

export async function getSmallModel(): Promise<LanguageModel | null> {
	const modelId = pickSmallModelId();
	if (!modelId) return null;
	const resolveModel = await getResolver();
	return resolveModel(modelId) as LanguageModel;
}

export function hasSmallModelCredentials(): boolean {
	return pickSmallModelId() !== null;
}
