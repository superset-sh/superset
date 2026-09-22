/**
 * Keeps host-launched agent CLIs from stalling on their "do you trust this
 * folder?" dialog, without the host ever deciding trust for content it did
 * not write.
 *
 * Agent CLIs treat a git repo root as its own trust domain (worktrees inherit
 * from the main checkout; a trusted ancestor directory does not cover a repo
 * inside it), and record acceptance per account store. Two cases follow:
 *
 * - Session folders are standalone repos the host itself just created as an
 *   empty scaffold, so nothing can be inherited and every new session would
 *   prompt. Auto-trusting is sound only because the host authored the folder.
 * - Project folders hold content the host did not write (a clone, a
 *   teammate's branch), so adding one to Superset is not a trust decision and
 *   the host never makes one. But because trust is per account, a folder the
 *   user accepted under one login prompts again under every other login, and
 *   again after switching the default account. The host only carries the
 *   user's own recorded acceptance of that exact folder (or of the project's
 *   main checkout) to the account the launch resolves to. A folder no account
 *   has accepted still shows the dialog, and an explicit decline in the
 *   launching account is never worked around.
 *
 * Everything here is best-effort — a failure just means the dialog shows.
 */

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../../../db";
import { projects } from "../../../../db/schema";
import { resolveDefaultAccountEnv } from "../../usage/default-account";
import { claudeFolderTrust } from "./claude-trust";
import { codexFolderTrust } from "./codex-trust";
import type { FolderTrustProvider } from "./types";

export const FOLDER_TRUST_PROVIDERS: readonly FolderTrustProvider[] = [
	claudeFolderTrust,
	codexFolderTrust,
];

interface TrustLaunchConfig {
	presetId: string;
	command: string;
	env: Record<string, string>;
}

/**
 * Provider for an agent config, from its preset id or launch executable. The
 * executable check covers custom presets that still run the stock binaries
 * (possibly via absolute paths or wrappers named after them).
 */
export function resolveFolderTrustProvider(
	config: { presetId: string; command: string },
	providers: readonly FolderTrustProvider[] = FOLDER_TRUST_PROVIDERS,
): FolderTrustProvider | null {
	const [token = ""] = config.command.trim().split(/\s+/);
	const executable = (token.split(/[\\/]/).pop() ?? "")
		.toLowerCase()
		.replace(/\.exe$/, "");
	return (
		providers.find(
			({ family }) => config.presetId === family || executable === family,
		) ?? null
	);
}

function normalizeFolderPath(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

/**
 * The folders in `folderPaths` that the user accepted under some account
 * other than the launching one. Empty when the launching account already
 * trusts one (a worktree inherits from its main checkout) or has declined
 * one. Other accounts are listed lazily: finding them scans the home
 * directory, which a settled launch should not pay for.
 */
export async function findCarriedFolderTrust(
	provider: Pick<FolderTrustProvider, "readDecision" | "discoverStoreFiles">,
	targetStore: string,
	folderPaths: string[],
): Promise<string[]> {
	for (const folderPath of folderPaths) {
		const decision = await provider.readDecision(targetStore, folderPath);
		if (decision !== "none") return [];
	}
	const otherStores = (await provider.discoverStoreFiles()).filter(
		(store) => store !== targetStore,
	);
	const carried: string[] = [];
	for (const folderPath of folderPaths) {
		for (const store of otherStores) {
			if ((await provider.readDecision(store, folderPath)) === "trusted") {
				carried.push(folderPath);
				break;
			}
		}
	}
	return carried;
}

/**
 * Returns the args the launch command needs. The target store must mirror
 * launch-time account resolution: per-agent env wins over the host-default
 * selection (`{...accountEnv, ...config.env}` in buildTerminalAgentLaunch).
 */
export async function prepareFolderTrust(
	db: HostDb,
	workspace: { worktreePath: string; projectId: string | null },
	config: TrustLaunchConfig,
	providers: readonly FolderTrustProvider[] = FOLDER_TRUST_PROVIDERS,
): Promise<string[]> {
	try {
		const provider = resolveFolderTrustProvider(config, providers);
		if (provider === null) return [];
		const targetStore = provider.storeFile({
			...resolveDefaultAccountEnv(db, provider.family),
			...config.env,
		});
		const folderPath = normalizeFolderPath(workspace.worktreePath);

		if (workspace.projectId === null) {
			// Persisted, not overridden: the folder is the host's own, and agents
			// the user later types into this session's terminals should not
			// prompt either.
			await provider.persist(targetStore, folderPath);
			return [];
		}

		const project = db
			.select({ repoPath: projects.repoPath })
			.from(projects)
			.where(eq(projects.id, workspace.projectId))
			.get();
		const carried = await findCarriedFolderTrust(provider, targetStore, [
			...new Set([
				folderPath,
				...(project ? [normalizeFolderPath(project.repoPath)] : []),
			]),
		]);
		if (provider.launchOverride) return provider.launchOverride(carried);
		for (const carriedPath of carried) {
			await provider.persist(targetStore, carriedPath);
		}
		return [];
	} catch (err) {
		console.warn(
			`[agents.run] failed to settle folder trust for '${workspace.worktreePath}' (agent '${config.presetId}'):`,
			err,
		);
		return [];
	}
}
