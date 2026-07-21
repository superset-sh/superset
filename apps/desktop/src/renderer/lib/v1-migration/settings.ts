import type { BranchPrefixMode } from "@superset/shared/workspace-launch";

// Audit result (see plans/20260716-v1-to-v2-auto-migration.md): v1 and v2
// share the electron-main settings row for user preferences (fonts,
// notifications, editor, behavior toggles, ...), and the host-wide worktree
// base dir is seeded from SUPERSET_LEGACY_WORKTREE_BASE_DIR on first host
// boot. The only settings that live in a different v2 store are the branch
// prefix (host-wide) and the per-project worktree-dir / branch-prefix
// overrides — all in host.db, all keep-v2 on conflict.

export interface BranchPrefixValue {
	mode: BranchPrefixMode | null;
	customPrefix: string | null;
}

export type HostBranchPrefixPlan =
	| { action: "set"; mode: BranchPrefixMode; customPrefix: string | null }
	| { action: "keep-v2" }
	| { action: "nothing" };

/**
 * Host-wide branch prefix: copy the v1 value only when v1 has an explicit
 * non-default and the host was never configured. "none" is both the v1 and
 * host default, so it never counts as configuration.
 */
export function planHostBranchPrefix(
	v1: BranchPrefixValue,
	host: BranchPrefixValue,
): HostBranchPrefixPlan {
	const v1Configured = v1.mode !== null && v1.mode !== "none";
	if (!v1Configured) return { action: "nothing" };
	const hostConfigured = host.mode !== null && host.mode !== "none";
	if (hostConfigured) return { action: "keep-v2" };
	return {
		action: "set",
		mode: v1.mode as BranchPrefixMode,
		customPrefix: v1.mode === "custom" ? v1.customPrefix : null,
	};
}

export interface V1ProjectPrefs {
	worktreeBaseDir: string | null;
	branchPrefixMode: BranchPrefixMode | null;
	branchPrefixCustom: string | null;
}

export interface V2ProjectPrefs {
	worktreeBaseDir: string | null;
	branchPrefixMode: BranchPrefixMode | null;
	branchPrefixCustom: string | null;
}

export interface ProjectPrefsPlan {
	setWorktreeBaseDir: string | null;
	setBranchPrefix: {
		mode: BranchPrefixMode;
		customPrefix: string | null;
	} | null;
	/** v1 had an override the v2 project already configured differently. */
	keptV2: boolean;
}

/**
 * Per-project overrides: apply each v1 override only where the v2 project
 * has none. Returns null when v1 has no overrides at all (nothing to do).
 */
export function planProjectPrefs(
	v1: V1ProjectPrefs,
	v2: V2ProjectPrefs,
): ProjectPrefsPlan | null {
	const v1PrefixConfigured =
		v1.branchPrefixMode !== null && v1.branchPrefixMode !== "none";
	if (!v1.worktreeBaseDir && !v1PrefixConfigured) return null;

	const plan: ProjectPrefsPlan = {
		setWorktreeBaseDir: null,
		setBranchPrefix: null,
		keptV2: false,
	};

	if (v1.worktreeBaseDir) {
		if (v2.worktreeBaseDir) plan.keptV2 = true;
		else plan.setWorktreeBaseDir = v1.worktreeBaseDir;
	}

	if (v1PrefixConfigured) {
		const v2PrefixConfigured =
			v2.branchPrefixMode !== null && v2.branchPrefixMode !== "none";
		if (v2PrefixConfigured) plan.keptV2 = true;
		else {
			plan.setBranchPrefix = {
				mode: v1.branchPrefixMode as BranchPrefixMode,
				customPrefix:
					v1.branchPrefixMode === "custom" ? v1.branchPrefixCustom : null,
			};
		}
	}

	return plan;
}
