import type { ProviderId } from "./usage-snapshot";

/**
 * Single place to update when a provider changes prices. Bump
 * PRICING_TABLE_UPDATED whenever a rate is edited. Rates are USD per 1M tokens.
 *
 * Sources (verify here before editing):
 * - Claude:  https://www.anthropic.com/pricing#api
 * - Codex:   https://openai.com/api/pricing/
 * - Gemini:  https://ai.google.dev/gemini-api/docs/pricing
 */
export const PRICING_TABLE_UPDATED = "2026-07-20";

export interface ModelRate {
	inputPerMillion: number;
	outputPerMillion: number;
}

type ProviderPricing = {
	models: Record<string, ModelRate>;
	cheapest: ModelRate;
};

const CLAUDE_MODELS: Record<string, ModelRate> = {
	"claude-opus-4": { inputPerMillion: 15, outputPerMillion: 75 },
	"claude-sonnet-4": { inputPerMillion: 3, outputPerMillion: 15 },
	"claude-haiku-4": { inputPerMillion: 1, outputPerMillion: 5 },
	"claude-fable-5": { inputPerMillion: 5, outputPerMillion: 25 },
};

const CODEX_MODELS: Record<string, ModelRate> = {
	"gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
	"gpt-4.1": { inputPerMillion: 2, outputPerMillion: 8 },
	"gpt-4.5": { inputPerMillion: 75, outputPerMillion: 150 },
};

const GEMINI_MODELS: Record<string, ModelRate> = {
	"gemini-2.5-pro": { inputPerMillion: 1.25, outputPerMillion: 10 },
	"gemini-2.5-flash": { inputPerMillion: 0.3, outputPerMillion: 2.5 },
};

function cheapestRate(models: Record<string, ModelRate>): ModelRate {
	return Object.values(models).reduce((cheapest, rate) =>
		rate.inputPerMillion + rate.outputPerMillion <
		cheapest.inputPerMillion + cheapest.outputPerMillion
			? rate
			: cheapest,
	);
}

const PRICING_TABLE: Partial<Record<ProviderId, ProviderPricing>> = {
	claude: { models: CLAUDE_MODELS, cheapest: cheapestRate(CLAUDE_MODELS) },
	codex: { models: CODEX_MODELS, cheapest: cheapestRate(CODEX_MODELS) },
	gemini: { models: GEMINI_MODELS, cheapest: cheapestRate(GEMINI_MODELS) },
};

export interface ResolvedRate {
	rate: ModelRate;
	/** True when the model is unknown and the provider's cheapest rate was used. */
	approximate: boolean;
}

function matchModelRate(
	models: Record<string, ModelRate>,
	model: string,
): ModelRate | null {
	const normalized = model.toLowerCase();
	if (models[normalized]) return models[normalized];
	// CLI logs carry dated/suffixed ids (e.g. "claude-opus-4-8", "gpt-4.1-mini");
	// match against the longest known prefix.
	const keys = Object.keys(models).sort((a, b) => b.length - a.length);
	for (const key of keys) {
		if (normalized.startsWith(key)) return models[key];
	}
	return null;
}

export function resolveModelRate(
	providerId: ProviderId,
	model: string,
): ResolvedRate | null {
	const pricing = PRICING_TABLE[providerId];
	if (!pricing) return null;
	const match = matchModelRate(pricing.models, model);
	if (match) return { rate: match, approximate: false };
	return { rate: pricing.cheapest, approximate: true };
}
