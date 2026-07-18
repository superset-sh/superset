import {
	getAnthropicProviderOptions,
	getCredentialsFromAnySource,
} from "../auth/anthropic";

export interface ClaudeModelOption {
	/** Exact model id, valid as a `/model` argument (e.g. "claude-opus-4-8"). */
	id: string;
	/** Display name without the "Claude " prefix (e.g. "Opus 4.8"). */
	label: string;
	family: ClaudeModelFamily;
}

const MODEL_FAMILIES = ["opus", "fable", "sonnet", "haiku"] as const;
export type ClaudeModelFamily = (typeof MODEL_FAMILIES)[number];

const CACHE_TTL_MS = 30 * 60 * 1000;

interface ModelsCache {
	expiresAt: number;
	options: ClaudeModelOption[];
}

let cache: ModelsCache | null = null;

export function clearClaudeModelsCache(): void {
	cache = null;
}

interface AnthropicModelEntry {
	id?: string;
	display_name?: string;
	created_at?: string;
}

function familyOf(modelId: string): ClaudeModelFamily | null {
	const match = modelId.match(/^claude-([a-z]+)-/);
	const family = match?.[1];
	return MODEL_FAMILIES.includes(family as ClaudeModelFamily)
		? (family as ClaudeModelFamily)
		: null;
}

/**
 * Current Claude model lineup from the Anthropic /v1/models API, using the
 * user's existing Claude credentials (Claude Code config/keychain or app
 * auth) — so new model releases appear without a code change. Reduced to the
 * latest model per family, mirroring the shape of Claude Code's own /model
 * picker. Returns [] when no credentials are available or the request fails;
 * callers keep a static fallback for that case.
 */
export async function listClaudeModels(): Promise<ClaudeModelOption[]> {
	if (cache && cache.expiresAt > Date.now()) return cache.options;

	const credentials = await getCredentialsFromAnySource();
	if (!credentials) return [];

	const provider = getAnthropicProviderOptions(credentials);
	const headers: Record<string, string> = {
		"anthropic-version": "2023-06-01",
		...("apiKey" in provider
			? { "x-api-key": provider.apiKey }
			: {
					authorization: `Bearer ${provider.authToken}`,
					...provider.headers,
				}),
	};

	let entries: AnthropicModelEntry[];
	try {
		const response = await fetch(
			"https://api.anthropic.com/v1/models?limit=100",
			{
				headers,
				signal: AbortSignal.timeout(10_000),
			},
		);
		if (!response.ok) return [];
		const body = (await response.json()) as { data?: AnthropicModelEntry[] };
		entries = body.data ?? [];
	} catch {
		return [];
	}

	// Latest release per family; the API returns created_at as ISO strings.
	const latestByFamily = new Map<ClaudeModelFamily, AnthropicModelEntry>();
	for (const entry of entries) {
		if (!entry.id) continue;
		const family = familyOf(entry.id);
		if (!family) continue;
		const current = latestByFamily.get(family);
		if (!current || (entry.created_at ?? "") > (current.created_at ?? "")) {
			latestByFamily.set(family, entry);
		}
	}

	const options: ClaudeModelOption[] = [];
	for (const family of MODEL_FAMILIES) {
		const entry = latestByFamily.get(family);
		if (!entry?.id) continue;
		options.push({
			id: entry.id,
			label: (entry.display_name ?? entry.id).replace(/^Claude\s+/, ""),
			family,
		});
	}

	if (options.length > 0) {
		cache = { expiresAt: Date.now() + CACHE_TTL_MS, options };
	}
	return options;
}
