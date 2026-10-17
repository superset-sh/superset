import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { terminalAgentBindings, workspaces } from "../db/schema";
import { pinnedAccountEnv } from "../trpc/router/agents/launch-account";
import { resolveDefaultAccountEnv } from "../trpc/router/usage/default-account";
import { parsePersistedSessionAccount } from "../trpc/router/usage/session-account/session-account";
import { agentLaunchEnv, resolveHostAgentConfig } from "./agent-config";
import type { HarnessSessionRef } from "./harness-sessions";

/**
 * Everything the host knows about where a terminal's bound agent session
 * lives: its harness, session id, worktree, the transcript path the harness
 * reported, and the account env it launched under.
 *
 * The harness is the binding's, not the config's preset: a custom agent that
 * wraps `claude` has preset "custom", but Claude wrote its session.
 */
export function terminalHarnessSession(
	db: HostDb,
	terminalId: string,
): { ref: HarnessSessionRef; endedAt: number | null } | null {
	const binding = db
		.select({
			agentId: terminalAgentBindings.agentId,
			agentSessionId: terminalAgentBindings.agentSessionId,
			definitionId: terminalAgentBindings.definitionId,
			workspaceId: terminalAgentBindings.workspaceId,
			transcriptPath: terminalAgentBindings.transcriptPath,
			endedAt: terminalAgentBindings.endedAt,
			accountJson: terminalAgentBindings.accountJson,
		})
		.from(terminalAgentBindings)
		.where(eq(terminalAgentBindings.terminalId, terminalId))
		.get();
	if (!binding) return null;
	const worktreePath = db
		.select({ path: workspaces.worktreePath })
		.from(workspaces)
		.where(eq(workspaces.id, binding.workspaceId))
		.get()?.path;
	const config = resolveHostAgentConfig(
		db,
		binding.definitionId ?? binding.agentId,
	);
	const account = parsePersistedSessionAccount(binding.accountJson);
	if (account === null) return null;
	return {
		ref: {
			agentId: binding.agentId,
			sessionId: binding.agentSessionId,
			worktreePath,
			reportedPath: binding.transcriptPath,
			env: account?.pinned
				? pinnedAccountEnv(account)
				: config
					? agentLaunchEnv(db, config)
					: resolveDefaultAccountEnv(db, binding.agentId),
		},
		endedAt: binding.endedAt,
	};
}
