import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { discoverClaudeProfiles, discoverCodexHomes } from "../profiles";
import { collectLogFiles, dedupeLogFiles } from "./logs";
import type { UsageLogEntry } from "./parse";
import { parseClaudeLogFile, parseCodexLogFile } from "./parse";

export interface CollectedUsage {
	entries: UsageLogEntry[];

	sessionLabels: Map<string, string>;

	scannedFiles: number;
}

export async function collectUsageEntries(
	days: number,
	cutoffMs: number,
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
	entries.push(...claudeEntriesByMessage.values());
	for (const file of codexFiles) {
		await parseCodexLogFile(file, cutoffMs, entries, sessionLabels);
	}

	return {
		entries,
		sessionLabels,
		scannedFiles: claudeFiles.length + codexFiles.length,
	};
}
