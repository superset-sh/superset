import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface CodexReasoningLevel {
	/** Effort value as Codex names it (e.g. "low", "xhigh", "ultra"). */
	effort: string;
	description?: string;
}

export interface CodexModelOption {
	/** Model slug (e.g. "gpt-5.6-sol"), matching session-hook detected ids. */
	id: string;
	/** Display name from Codex (e.g. "GPT-5.6-Sol"). */
	label: string;
	description?: string;
	/** In Codex's order: low → ultra. Max/ultra live in the picker's
	 * "More reasoning…" submenu. */
	supportedReasoningLevels: CodexReasoningLevel[];
	defaultReasoningLevel: string;
}

const CACHE_TTL_MS = 30 * 60 * 1000;

interface ModelsCache {
	expiresAt: number;
	options: CodexModelOption[];
}

let cache: ModelsCache | null = null;

export function clearCodexModelsCache(): void {
	cache = null;
}

interface CodexModelEntry {
	slug?: string;
	display_name?: string;
	description?: string;
	default_reasoning_level?: string;
	supported_reasoning_levels?: { effort?: string; description?: string }[];
	visibility?: string;
	priority?: number;
}

/**
 * Visible models in Codex's own /model picker order: `visibility: "list"`
 * entries sorted by ascending priority (verified against the rendered picker
 * for codex-cli 0.144.5). The row index in this list +1 is the digit that
 * selects the model in the interactive picker.
 */
function toOptions(entries: CodexModelEntry[]): CodexModelOption[] {
	return entries
		.filter((entry) => entry.slug && entry.visibility === "list")
		.sort(
			(a, b) =>
				(a.priority ?? Number.MAX_SAFE_INTEGER) -
				(b.priority ?? Number.MAX_SAFE_INTEGER),
		)
		.map((entry) => ({
			id: entry.slug as string,
			label: entry.display_name ?? (entry.slug as string),
			description: entry.description,
			supportedReasoningLevels: (entry.supported_reasoning_levels ?? [])
				.filter((level) => level.effort)
				.map((level) => ({
					effort: level.effort as string,
					description: level.description,
				})),
			defaultReasoningLevel: entry.default_reasoning_level ?? "medium",
		}));
}

/**
 * Codex refreshes ~/.codex/models_cache.json on every TUI boot, so it holds
 * exactly the model list a running session's picker shows — and reading it
 * needs no subprocess.
 */
async function readModelsCacheFile(): Promise<CodexModelEntry[] | null> {
	try {
		const raw = await readFile(
			join(homedir(), ".codex", "models_cache.json"),
			"utf8",
		);
		const parsed = JSON.parse(raw) as { models?: CodexModelEntry[] };
		return parsed.models ?? null;
	} catch {
		return null;
	}
}

/** The host process may not have the user's PATH, so try common installs. */
const CODEX_BINARY_CANDIDATES = [
	"codex",
	"/opt/homebrew/bin/codex",
	"/usr/local/bin/codex",
	join(homedir(), ".local", "bin", "codex"),
];

/** `codex debug models` prints the same JSON the cache file stores. */
async function execDebugModels(): Promise<CodexModelEntry[] | null> {
	for (const binary of CODEX_BINARY_CANDIDATES) {
		const stdout = await new Promise<string | null>((resolve) => {
			execFile(
				binary,
				["debug", "models"],
				{ timeout: 15_000, maxBuffer: 10 * 1024 * 1024 },
				(error, out) => resolve(error ? null : out),
			);
		});
		if (stdout === null) continue;
		try {
			const parsed = JSON.parse(stdout) as { models?: CodexModelEntry[] };
			if (parsed.models) return parsed.models;
		} catch {
			// fall through to the next candidate
		}
	}
	return null;
}

/**
 * Current Codex model lineup, in the same order as the CLI's own /model
 * picker rows — the terminal composer drives that picker by row number, so
 * order fidelity matters more than freshness. Reads Codex's local models
 * cache first (no subprocess; refreshed by every Codex boot), falling back
 * to `codex debug models`. Returns [] when neither source works; callers
 * keep an open-the-picker fallback for that case.
 */
export async function listCodexModels(): Promise<CodexModelOption[]> {
	if (cache && cache.expiresAt > Date.now()) return cache.options;

	const entries = (await readModelsCacheFile()) ?? (await execDebugModels());
	if (!entries) return [];

	const options = toOptions(entries);
	if (options.length > 0) {
		cache = { expiresAt: Date.now() + CACHE_TTL_MS, options };
	}
	return options;
}
