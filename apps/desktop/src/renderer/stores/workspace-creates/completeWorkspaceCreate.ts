import { agentLaunchFailureDetail } from "./agentLaunchFailures";

export interface CompleteWorkspaceCreateArgs {
	workspace: { id: string; projectId: string | null };
	agents: ReadonlyArray<{ ok: true } | { ok: false; error: string }>;
	alreadyExists?: boolean;
	/**
	 * The caller asked for agents. The two recovery paths resolve with an empty
	 * `agents[]` they never observed, and must not be read as a launch failure.
	 */
	requestedAgents: boolean;
	/**
	 * Adopting an existing worktree (the host reports that as new), or a create
	 * that opted out of setup — e.g. "Import worktrees" with "Run setup" off.
	 */
	skipsCreationPresets: boolean;
	unknownError: string;
}

export interface CompleteWorkspaceCreateEffects {
	recordWorkspaceCreated: () => void;
	queueCreationPresets: (workspace: { id: string; projectId: string }) => void;
}

/**
 * Runs the bookkeeping a created workspace is owed, then reports whether a
 * requested agent failed to launch — `null` when none did.
 *
 * A failed agent launch keeps the workspace and navigates the user into it, so
 * the workspace is owed its creation presets and its star-nag count either way.
 * Ordering the two here is what stops the failure outcome from being returned
 * before them.
 */
export function completeWorkspaceCreate(
	args: CompleteWorkspaceCreateArgs,
	effects: CompleteWorkspaceCreateEffects,
): string | null {
	// Only genuinely new worktrees count as created — never reopened ones or
	// project-less sessions (createSession has no alreadyExists signal, so an
	// undefined value here is treated as "not new").
	const { id, projectId } = args.workspace;
	if (projectId !== null && args.alreadyExists === false) {
		effects.recordWorkspaceCreated();
		if (!args.skipsCreationPresets) {
			effects.queueCreationPresets({ id, projectId });
		}
	}

	if (!args.requestedAgents) return null;
	return agentLaunchFailureDetail(args.agents, args.unknownError);
}
