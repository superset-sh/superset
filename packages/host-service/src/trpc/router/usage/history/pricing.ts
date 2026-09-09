import type { UsageAgent } from "../types";

/**
 * API list prices in USD per million tokens. Used to price subscription
 * usage at API-equivalent rates ("what this would have cost on the API") —
 * always labeled as an estimate in the UI, never as money spent.
 *
 * Longest-prefix match on the lowercased model id; unknown models fall back
 * to the agent's cheapest rate and mark the result approximate.
 */
export const PRICING_TABLE_UPDATED = "2026-09-03";

export interface ModelRate {
	inputPerM: number;
	outputPerM: number;
	/**
	 * Cache-read price in USD per million tokens, for models priced off the
	 * usual `CACHE_READ_MULTIPLIER` share of input.
	 */
	cacheReadPerM?: number;
	longContext?: ModelRate;
}

/** Cache multipliers applied against the model's input rate. */
export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_5M_MULTIPLIER = 1.25;
export const CACHE_WRITE_1H_MULTIPLIER = 2;

const CLAUDE_RATES: Record<string, ModelRate> = {
	// Fable 5.1 and Mythos 5.1 keep Fable 5's token price but cut cache reads
	// to $0.25/M (0.025x input) instead of the usual 0.1x.
	"claude-fable-5-1": { inputPerM: 10, outputPerM: 50, cacheReadPerM: 0.25 },
	"claude-mythos-5-1": { inputPerM: 10, outputPerM: 50, cacheReadPerM: 0.25 },
	"claude-fable-5": { inputPerM: 10, outputPerM: 50 },
	"claude-mythos": { inputPerM: 10, outputPerM: 50 },
	"claude-opus-5": { inputPerM: 5, outputPerM: 25 },
	"claude-opus-4-8": { inputPerM: 5, outputPerM: 25 },
	"claude-opus-4-7": { inputPerM: 5, outputPerM: 25 },
	"claude-opus-4-6": { inputPerM: 5, outputPerM: 25 },
	"claude-opus-4-5": { inputPerM: 5, outputPerM: 25 },
	// Opus 4.0/4.1 predate the price cut.
	"claude-opus-4": { inputPerM: 15, outputPerM: 75 },
	// Sonnet 5's launch price is permanent: the $3/$15 increase scheduled for
	// 2026-09-01 was cancelled.
	"claude-sonnet-5": { inputPerM: 2, outputPerM: 10 },
	"claude-sonnet-4": { inputPerM: 3, outputPerM: 15 },
	"claude-haiku-4-5": { inputPerM: 1, outputPerM: 5 },
	"claude-3-5-haiku": { inputPerM: 0.8, outputPerM: 4 },
};

const CODEX_RATES: Record<string, ModelRate> = {
	// GPT-6 Astra (2026-09-03): cached input is $1/M, the usual 0.1x.
	"gpt-6-astra": { inputPerM: 10, outputPerM: 50 },
	// Sol's promotional price, published as lasting at least through
	// 2026-11-21; the bare `gpt-5.6` id follows Sol.
	"gpt-5.6-sol": { inputPerM: 4, outputPerM: 20 },
	"gpt-5.6-terra": { inputPerM: 2, outputPerM: 12 },
	"gpt-5.6-luna": { inputPerM: 0.2, outputPerM: 1.2 },
	"gpt-5.6": { inputPerM: 4, outputPerM: 20 },
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

const AGY_RATES: Record<string, ModelRate> = {
	...CLAUDE_RATES,
	...CODEX_RATES,
	"gemini-3.1-pro": {
		inputPerM: 2,
		outputPerM: 12,
		longContext: { inputPerM: 4, outputPerM: 18 },
	},
	"gemini-3-flash": { inputPerM: 0.5, outputPerM: 3 },
	"gemini-2.5-pro": {
		inputPerM: 1.25,
		outputPerM: 10,
		longContext: { inputPerM: 2.5, outputPerM: 15 },
	},
	"gemini-2.5-flash": { inputPerM: 0.3, outputPerM: 2.5 },
};

// Cursor prices per request server-side; its usage events carry the real
// cost, so this table is only the fallback for events without one.
const CURSOR_RATES: Record<string, ModelRate> = {
	composer: { inputPerM: 1.25, outputPerM: 10 },
};

/** Multi-model harnesses (opencode, pi, omp, copilot, fx) route to many
 * upstream providers — match against every table we know. Harness-reported
 * costs, when present, take precedence over these rates anyway. */
const MULTI_AGENT_RATES: Record<string, ModelRate> = {
	...CLAUDE_RATES,
	...CODEX_RATES,
	...GROK_RATES,
};

const RATES_BY_AGENT: Record<UsageAgent, Record<string, ModelRate>> = {
	claude: CLAUDE_RATES,
	codex: CODEX_RATES,
	grok: GROK_RATES,
	agy: AGY_RATES,
	cursor: CURSOR_RATES,
	opencode: MULTI_AGENT_RATES,
	copilot: MULTI_AGENT_RATES,
	pi: MULTI_AGENT_RATES,
	omp: MULTI_AGENT_RATES,
	fx: MULTI_AGENT_RATES,
};

const cheapestByAgent = new Map<UsageAgent, ModelRate>();
function cheapestRate(agent: UsageAgent): ModelRate {
	let cheapest = cheapestByAgent.get(agent);
	if (!cheapest) {
		for (const rate of Object.values(RATES_BY_AGENT[agent])) {
			if (
				!cheapest ||
				rate.inputPerM + rate.outputPerM <
					cheapest.inputPerM + cheapest.outputPerM
			) {
				cheapest = rate;
			}
		}
		cheapestByAgent.set(agent, cheapest as ModelRate);
	}
	return cheapest as ModelRate;
}

export interface MatchedRate extends ModelRate {
	/** True when the model wasn't in the table and got the cheapest fallback. */
	approximate: boolean;
}

export function matchModelRate(
	agent: UsageAgent,
	model: string,
	promptTokens = 0,
): MatchedRate {
	const rates = RATES_BY_AGENT[agent];
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
	if (best) {
		const rate =
			promptTokens > 200_000 && best.rate.longContext
				? best.rate.longContext
				: best.rate;
		return { ...rate, approximate: false };
	}
	return { ...cheapestRate(agent), approximate: true };
}

export interface TokenCounts {
	uncachedInput: number;
	cachedInput: number;
	cacheWrite5m: number;
	cacheWrite1h: number;
	output: number;
}

/** The model's own cache-read price, else the usual share of its input rate. */
function cacheReadPerM(rate: ModelRate): number {
	return rate.cacheReadPerM ?? rate.inputPerM * CACHE_READ_MULTIPLIER;
}

export function costUsd(rate: ModelRate, tokens: TokenCounts): number {
	return (
		(tokens.uncachedInput / 1e6) * rate.inputPerM +
		(tokens.output / 1e6) * rate.outputPerM +
		(tokens.cachedInput / 1e6) * cacheReadPerM(rate) +
		(tokens.cacheWrite5m / 1e6) * rate.inputPerM * CACHE_WRITE_5M_MULTIPLIER +
		(tokens.cacheWrite1h / 1e6) * rate.inputPerM * CACHE_WRITE_1H_MULTIPLIER
	);
}

/** Dollars saved by cache reads vs paying full input price for them. */
export function cacheSavingsUsd(rate: ModelRate, tokens: TokenCounts): number {
	return (tokens.cachedInput / 1e6) * (rate.inputPerM - cacheReadPerM(rate));
}
