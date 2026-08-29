import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { discoverClaudeProfiles, discoverCodexHomes } from "../profiles";
import { collectAgyEntries } from "./agy";
import { collectCopilotEntries } from "./copilot";
import { collectCursorEntries } from "./cursor";
import { collectFxEntries } from "./fx";
import { collectGrokEntries, grokHomes } from "./grok";
import { collectLogFiles, dedupeLogFiles } from "./logs";
import { collectOpencodeEntries } from "./opencode";
import type { UsageLogEntry } from "./parse";
import { parseClaudeLogFile, parseCodexLogFile } from "./parse";
import { collectPiEntries } from "./pi";

export interface CollectedUsage {
	entries: UsageLogEntry[];

	sessionLabels: Map<string, string>;

	scannedFiles: number;
}

export interface CollectUsageOptions {
	/** Known workspace/project roots — cursor's only way to attribute a cwd
	 * (its chat dirs are keyed by md5 of the launch cwd). */
	cwdCandidates?: readonly string[];
}

export async function collectUsageEntries(
	days: number,
	cutoffMs: number,
	options: CollectUsageOptions = {},
): Promise<CollectedUsage> {
	const home = homedir();

	// Same homes the quota discovery covers: the default locations, any
	// CLAUDE_CONFIG_DIR entries (comma-list), and auto-discovered profile /
	// CODEX_HOME dirs — a custom config dir keeps its transcripts INSIDE the
	// dir, so multi-account history means scanning every profile's projects/.
	const claudeHomes = new Set<string>([
		join(home, ".claude"),
		join(home, ".config", "claude"),
	]);
	for (const dir of (process.env.CLAUDE_CONFIG_DIR ?? "").split(",")) {
		if (dir.trim()) claudeHomes.add(dir.trim());
	}
	const [claudeProfiles, codexHomes] = await Promise.all([
		discoverClaudeProfiles(),
		discoverCodexHomes(),
	]);
	for (const profile of claudeProfiles) claudeHomes.add(profile.configDir);

	// Shared-history profiles symlink their projects/ into ~/.claude (see
	// session-share.ts), so two homes can name the same tree under different
	// paths — resolve every scan root and dedupe by real path, or the tree
	// gets walked and parsed once per profile.
	const resolveRoots = async (roots: string[]): Promise<string[]> => {
		const resolved = await Promise.all(
			roots.map(async (root) => {
				try {
					return await realpath(root);
				} catch {
					return null; // Dir absent — collectLogFiles would find nothing.
				}
			}),
		);
		return [
			...new Set(resolved.filter((root): root is string => root !== null)),
		];
	};
	const [claudeRoots, codexRoots] = await Promise.all([
		resolveRoots([...claudeHomes].map((root) => join(root, "projects"))),
		resolveRoots(
			codexHomes.map((codexHome) => join(codexHome.home, "sessions")),
		),
	]);
	const [claudeFileGroups, codexFileGroups] = await Promise.all([
		Promise.all(claudeRoots.map((root) => collectLogFiles(root, days + 1))),
		Promise.all(codexRoots.map((root) => collectLogFiles(root, days + 1))),
	]);
	const claudeFiles = dedupeLogFiles(claudeFileGroups.flat());
	const codexFiles = dedupeLogFiles(codexFileGroups.flat());

	const entries: UsageLogEntry[] = [];
	const claudeEntriesByMessage = new Map<string, UsageLogEntry>();
	const sessionLabels = new Map<string, string>();
	for (const file of claudeFiles) {
		await parseClaudeLogFile(
			file,
			claudeEntriesByMessage,
			cutoffMs,
			entries,
			sessionLabels,
		);
	}
	// Appended one at a time — spreading into push() passes every entry as a
	// call argument, which throws RangeError past V8's argument limit on
	// machines with a large enough usage history.
	for (const entry of claudeEntriesByMessage.values()) {
		entries.push(entry);
	}
	for (const file of codexFiles) {
		await parseCodexLogFile(file, cutoffMs, entries, sessionLabels);
	}

	// The remaining agents are independent of each other and of the two
	// above; each contributes into its own array so concurrent pushes can't
	// interleave, and one agent's failure never takes down the rest.
	let extraScannedFiles = 0;
	const collectors: Array<{
		run: (out: UsageLogEntry[]) => Promise<number | undefined>;
	}> = [
		{
			run: (out: UsageLogEntry[]) =>
				collectAgyEntries(cutoffMs, out, sessionLabels),
		},
		...grokHomes().map((grokHome) => ({
			run: (out: UsageLogEntry[]) =>
				collectGrokEntries(grokHome, cutoffMs, out, sessionLabels),
		})),
		{
			run: (out: UsageLogEntry[]) =>
				collectOpencodeEntries(cutoffMs, out, sessionLabels),
		},
		{
			run: (out: UsageLogEntry[]) =>
				collectPiEntries("pi", days, cutoffMs, out, sessionLabels),
		},
		{
			run: (out: UsageLogEntry[]) =>
				collectPiEntries("omp", days, cutoffMs, out, sessionLabels),
		},
		{ run: (out: UsageLogEntry[]) => collectFxEntries(cutoffMs, out) },
		{
			run: (out: UsageLogEntry[]) =>
				Promise.resolve(collectCopilotEntries(cutoffMs, out, sessionLabels)),
		},
		{
			// Cursor is the one networked collector (no local token counts
			// exist) — a signed-out CLI or an offline host contributes nothing.
			run: async (out: UsageLogEntry[]) => {
				await collectCursorEntries(
					cutoffMs,
					out,
					sessionLabels,
					options.cwdCandidates ?? [],
				);
				return 0;
			},
		},
	];
	const results = await Promise.allSettled(
		collectors.map(async ({ run }) => {
			const out: UsageLogEntry[] = [];
			const scanned = await run(out);
			return { out, scanned: scanned ?? 0 };
		}),
	);
	for (const result of results) {
		if (result.status !== "fulfilled") continue;
		extraScannedFiles += result.value.scanned;
		for (const entry of result.value.out) {
			entries.push(entry);
		}
	}

	return {
		entries,
		sessionLabels,
		scannedFiles: claudeFiles.length + codexFiles.length + extraScannedFiles,
	};
}
