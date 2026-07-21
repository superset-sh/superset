import type {
	ProviderUsage,
	ProviderUsageSnapshot,
} from "lib/trpc/routers/provider-usage.schema";
import { collectClaudeUsage } from "./providers/claude";
import { collectCodexUsage } from "./providers/codex";

const CACHE_DURATION_MS = 5 * 60_000;

interface ProviderUsageCollectorDependencies {
	now: () => number;
	collectClaude: () => Promise<ProviderUsage>;
	collectCodex: () => Promise<ProviderUsage>;
}

interface CollectProviderUsageOptions {
	force?: boolean;
}

function unavailableProvider(providerId: "claude" | "codex"): ProviderUsage {
	const providerName = providerId === "claude" ? "Claude" : "Codex";
	return {
		providerId,
		providerName,
		status: "unavailable",
		accountLabel: null,
		windows: [],
		errorMessage: `${providerName} usage is temporarily unavailable.`,
	};
}

async function collectSafely(
	providerId: "claude" | "codex",
	collector: () => Promise<ProviderUsage>,
): Promise<ProviderUsage> {
	try {
		return await collector();
	} catch {
		return unavailableProvider(providerId);
	}
}

export function createProviderUsageCollector(
	dependencies: ProviderUsageCollectorDependencies,
): (options?: CollectProviderUsageOptions) => Promise<ProviderUsageSnapshot> {
	let cachedSnapshot: ProviderUsageSnapshot | null = null;
	let inFlight: Promise<ProviderUsageSnapshot> | null = null;

	return async (options = {}) => {
		const now = dependencies.now();
		if (
			!options.force &&
			cachedSnapshot &&
			now - cachedSnapshot.collectedAt < CACHE_DURATION_MS
		) {
			return cachedSnapshot;
		}
		if (inFlight) return inFlight;

		inFlight = Promise.all([
			collectSafely("claude", dependencies.collectClaude),
			collectSafely("codex", dependencies.collectCodex),
		]).then(([claude, codex]) => {
			cachedSnapshot = {
				providers: [claude, codex],
				collectedAt: dependencies.now(),
			};
			return cachedSnapshot;
		});

		try {
			return await inFlight;
		} finally {
			inFlight = null;
		}
	};
}

export const collectProviderUsage = createProviderUsageCollector({
	now: Date.now,
	collectClaude: collectClaudeUsage,
	collectCodex: collectCodexUsage,
});
