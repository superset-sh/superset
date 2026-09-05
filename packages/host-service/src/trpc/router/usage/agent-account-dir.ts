/**
 * Which account directory an agent launch would actually use, and whether
 * Superset owns that choice (KTD12).
 *
 * Launch-time env resolution is `{...hostDefaultAccountEnv, ...config.env}`
 * in three places (the terminal agent launch, the trust seeder, the transcript
 * reader). This wrapper is the one place that also answers the second
 * question the account engine needs: a session whose `CLAUDE_CONFIG_DIR` /
 * `CODEX_HOME` differs from the `SUPERSET_DEFAULT_*` twin Superset injects
 * alongside it was pinned by the user — the engine must never restart it onto
 * another account.
 */

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { HostDb } from "../../../db/index.ts";
import { resolveDefaultAccountEnv } from "./default-account.ts";

/** The two agent families whose account dir Superset can switch. */
export type AccountDirFamily = "claude" | "codex";

const DIR_VARS: Record<
	AccountDirFamily,
	{ configDir: string; supersetTwin: string }
> = {
	claude: {
		configDir: "CLAUDE_CONFIG_DIR",
		supersetTwin: "SUPERSET_DEFAULT_CLAUDE_CONFIG_DIR",
	},
	codex: {
		configDir: "CODEX_HOME",
		supersetTwin: "SUPERSET_DEFAULT_CODEX_HOME",
	},
};

export interface AgentAccountDirInput {
	family: AccountDirFamily;
	/** The agent config's own env overlay, which wins over the host default. */
	env?: Record<string, string>;
}

export interface AgentAccountDir {
	/**
	 * The dir the launch would run under, or null when nothing overrides the
	 * CLI's own default home (`~/.claude`, `~/.codex`).
	 */
	configDir: string | null;
	/**
	 * False when the value came from the user rather than from Superset's
	 * account selection: such a session is listed as unmanaged and is never
	 * restarted onto another account.
	 */
	managed: boolean;
}

function samePath(a: string, b: string): boolean {
	if (a === b) return true;
	return canonical(a) === canonical(b);
}

function canonical(target: string): string {
	try {
		return realpathSync(target);
	} catch {
		return resolve(target);
	}
}

/**
 * Resolve `{ configDir, managed }` for one agent launch. `db` supplies the
 * host-wide account selection; `input.env` is the per-agent override that
 * wins over it, exactly as the launch composes them.
 */
export function resolveAgentAccountDir(
	db: HostDb,
	input: AgentAccountDirInput,
): AgentAccountDir {
	const vars = DIR_VARS[input.family];
	const env = {
		...resolveDefaultAccountEnv(db, input.family),
		...input.env,
	};
	const configDir = env[vars.configDir] || null;
	const injected = env[vars.supersetTwin] || null;
	if (configDir === null) {
		// No override at all: the CLI's own home, which the pointer still
		// governs the moment an account is selected.
		return { configDir: null, managed: true };
	}
	return {
		configDir,
		managed: injected !== null && samePath(configDir, injected),
	};
}
