import type { UsageProvider } from "../types";

/**
 * API list prices in USD per million tokens. Used to price subscription
 * usage at API-equivalent rates ("what this would have cost on the API") —
 * always labeled as an estimate in the UI, never as money spent.
 *
 * Longest-prefix match on the lowercased model id; unknown models fall back
 * to the provider's cheapest rate and mark the result approximate.
 */
export const PRICING_TABLE_UPDATED = "2026-08-16";

export interface ModelRate {
	inputPerM: number;
	outputPerM: number;
}

/** Cache multipliers applied against the model's input rate. */
export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_5M_MULTIPLIER = 1.25;
export const CACHE_WRITE_1H_MULTIPLIER = 2;

const CLAUDE_RATES: Record<string, ModelRate> = {
	"claude-fable-5": { inputPerM: 10, outputPerM: 50 },
	"claude-mythos": { inputPerM: 10, outputPerM: 50 },
	"claude-opus-5": { inputPerM: 5, outputPerM: 25 },
	"claude-opus-4-8": { inputPerM: 5, outputPerM: 25 },
	"claude-opus-4-7": { inputPerM: 5, outputPerM: 25 },
	"claude-opus-4-6": { inputPerM: 5, outputPerM: 25 },
	"claude-opus-4-5": { inputPerM: 5, outputPerM: 25 },
	// Opus 4.0/4.1 predate the price cut.
	"claude-opus-4": { inputPerM: 15, outputPerM: 75 },
	"claude-sonnet-5": { inputPerM: 3, outputPerM: 15 },
	"claude-sonnet-4": { inputPerM: 3, outputPerM: 15 },
	"claude-haiku-4-5": { inputPerM: 1, outputPerM: 5 },
	"claude-3-5-haiku": { inputPerM: 0.8, outputPerM: 4 },
};

const CODEX_RATES: Record<string, ModelRate> = {
	"gpt-5.6-sol": { inputPerM: 5, outputPerM: 30 },
	"gpt-5.6-terra": { inputPerM: 2, outputPerM: 12 },
	"gpt-5.6-luna": { inputPerM: 0.2, outputPerM: 1.2 },
	"gpt-5.6": { inputPerM: 5, outputPerM: 30 },
	"gpt-5.3-codex": { inputPerM: 1.75, outputPerM: 14 },
	"gpt-5.3": { inputPerM: 1.75, outputPerM: 14 },
	"gpt-5-codex": { inputPerM: 1.25, outputPerM: 10 },
	"gpt-5": { inputPerM: 1.25, outputPerM: 10 },
	"gpt-4.1": { inputPerM: 2, outputPerM: 8 },
	"gpt-4o": { inputPerM: 2.5, outputPerM: 10 },
};

const GROK_RATES: Record<string, ModelRate> = {
	"grok-4.6": { inputPerM: 2, outputPerM: 6 },
	"grok-4.5": { inputPerM: 2, outputPerM: 6 },
	"grok-4-fast": { inputPerM: 0.2, outputPerM: 0.5 },
	"grok-4": { inputPerM: 3, outputPerM: 15 },
	"grok-code": { inputPerM: 0.2, outputPerM: 1.5 },
	"grok-3-mini": { inputPerM: 0.3, outputPerM: 0.5 },
	"grok-3": { inputPerM: 3, outputPerM: 15 },
};

// Cursor prices per request server-side; its usage events carry the real
// cost, so this table is only the fallback for events without one.
const CURSOR_RATES: Record<string, ModelRate> = {
	composer: { inputPerM: 1.25, outputPerM: 10 },
};

/** Multi-model harnesses (opencode, pi, omp, copilot, fx) route to many
 * upstream providers — match against every table we know. Harness-reported
 * costs, when present, take precedence over these rates anyway. */
const MULTI_PROVIDER_RATES: Record<string, ModelRate> = {
	...CLAUDE_RATES,
	...CODEX_RATES,
	...GROK_RATES,
};

const RATES_BY_PROVIDER: Record<UsageProvider, Record<string, ModelRate>> = {
	claude: CLAUDE_RATES,
	codex: CODEX_RATES,
	grok: GROK_RATES,
	cursor: CURSOR_RATES,
	opencode: MULTI_PROVIDER_RATES,
	copilot: MULTI_PROVIDER_RATES,
	pi: MULTI_PROVIDER_RATES,
	omp: MULTI_PROVIDER_RATES,
	fx: MULTI_PROVIDER_RATES,
};

const cheapestByProvider = new Map<UsageProvider, ModelRate>();
function cheapestRate(provider: UsageProvider): ModelRate {
	let cheapest = cheapestByProvider.get(provider);
	if (!cheapest) {
		for (const rate of Object.values(RATES_BY_PROVIDER[provider])) {
			if (
				!cheapest ||
				rate.inputPerM + rate.outputPerM <
					cheapest.inputPerM + cheapest.outputPerM
			) {
				cheapest = rate;
			}
		}
		cheapestByProvider.set(provider, cheapest as ModelRate);
	}
	return cheapest as ModelRate;
}

export interface MatchedRate extends ModelRate {
	/** True when the model wasn't in the table and got the cheapest fallback. */
	approximate: boolean;
}

export function matchModelRate(
	provider: UsageProvider,
	model: string,
): MatchedRate {
	const rates = RATES_BY_PROVIDER[provider];
	const normalized = model.toLowerCase();
	// Multi-model harnesses vendor-qualify ids ("anthropic/claude-sonnet-4");
	// also match on the segment after the last slash so those don't fall
	// through to the cheapest rate.
	const candidates = [normalized];
	const slash = normalized.lastIndexOf("/");
	if (slash >= 0 && slash < normalized.length - 1) {
		candidates.push(normalized.slice(slash + 1));
	}
	let best: { prefix: string; rate: ModelRate } | null = null;
	for (const candidate of candidates) {
		for (const [prefix, rate] of Object.entries(rates)) {
			if (
				candidate.startsWith(prefix) &&
				(!best || prefix.length > best.prefix.length)
			) {
				best = { prefix, rate };
			}
		}
	}
	if (best) return { ...best.rate, approximate: false };
	return { ...cheapestRate(provider), approximate: true };
}

export interface TokenCounts {
	uncachedInput: number;
	cachedInput: number;
	cacheWrite5m: number;
	cacheWrite1h: number;
	output: number;
}

export function costUsd(rate: ModelRate, tokens: TokenCounts): number {
	return (
		(tokens.uncachedInput / 1e6) * rate.inputPerM +
		(tokens.output / 1e6) * rate.outputPerM +
		(tokens.cachedInput / 1e6) * rate.inputPerM * CACHE_READ_MULTIPLIER +
		(tokens.cacheWrite5m / 1e6) * rate.inputPerM * CACHE_WRITE_5M_MULTIPLIER +
		(tokens.cacheWrite1h / 1e6) * rate.inputPerM * CACHE_WRITE_1H_MULTIPLIER
	);
}

/** Dollars saved by cache reads vs paying full input price for them. */
export function cacheSavingsUsd(rate: ModelRate, tokens: TokenCounts): number {
	return (
		(tokens.cachedInput / 1e6) * rate.inputPerM * (1 - CACHE_READ_MULTIPLIER)
	);
}
