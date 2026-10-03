/**
 * The vocabulary a teleport is described in, shared by the host that
 * performs one and the client that shows it.
 *
 * Types only, plus the pure functions that derive them. The git work lives
 * in host-service; nothing here may import node built-ins, because the
 * renderer imports this module to render the review dialog.
 */

/** What becomes of one pane on the other side. */
export type PaneDisposition =
	/** An agent with a resumable session: handoff note, then resume. */
	| { kind: "agent-resumes"; agent: string }
	/** An agent we cannot resume; it restarts with the handoff note only. */
	| { kind: "agent-restarts"; agent: string }
	/** A long-running process re-launched from its command line. */
	| { kind: "process-restarts"; command: string }
	/** A plain shell: the destination opens one, with no scrollback. */
	| { kind: "shell-opens" };

export interface PanePlan {
	paneId: string;
	/** What the pane is running now, for the row's left-hand side. */
	label: string;
	disposition: PaneDisposition;
}

export interface TabPlan {
	tabId: string;
	title: string;
	panes: PanePlan[];
}

export interface WorkingTreeSummary {
	modified: number;
	untracked: number;
	preciousFiles: number;
	unpushedCommits: number;
}

/**
 * The two ways a destination can be unable to take a branch. Both are cheap
 * to detect and expensive to discover late.
 */
export type TeleportRefusal =
	| { kind: "branch-checked-out"; branch: string; path: string }
	| { kind: "branch-diverged"; branch: string; destinationTip: string };

export interface TeleportPlan {
	branch: string;
	destinationHostName: string;
	/** Whether the destination has to clone before it can take the branch. */
	repository: "clone" | "fetch";
	workingTree: WorkingTreeSummary;
	tabs: TabPlan[];
	/** Non-empty means the move cannot proceed; the dialog shows these. */
	refusals: TeleportRefusal[];
	/** True when nothing but the branch itself would move. */
	isEmpty: boolean;
}

export interface BuildTeleportPlanInput {
	branch: string;
	destinationHostName: string;
	destinationHasRepository: boolean;
	workingTree: WorkingTreeSummary;
	tabs: TabPlan[];
	refusals?: TeleportRefusal[];
}

export function buildTeleportPlan({
	branch,
	destinationHostName,
	destinationHasRepository,
	workingTree,
	tabs,
	refusals = [],
}: BuildTeleportPlanInput): TeleportPlan {
	return {
		branch,
		destinationHostName,
		repository: destinationHasRepository ? "fetch" : "clone",
		workingTree,
		tabs,
		refusals,
		isEmpty: isNothingToMove(workingTree, tabs),
	};
}

/**
 * A move with no uncommitted work and no panes still does something useful
 * (the branch appears there, the workspace opens), but the dialog should say
 * so rather than implying work is in flight.
 */
function isNothingToMove(
	workingTree: WorkingTreeSummary,
	tabs: TabPlan[],
): boolean {
	const clean =
		workingTree.modified === 0 &&
		workingTree.untracked === 0 &&
		workingTree.preciousFiles === 0 &&
		workingTree.unpushedCommits === 0;
	return clean && tabs.every((tab) => tab.panes.length === 0);
}

/**
 * The disposition of a pane, from what host-service already knows about it.
 *
 * The ordering is the point: a resumable agent session outranks the process
 * it happens to be running, because "resume the conversation" is what the
 * user means by moving an agent pane. Only a pane running nothing at all
 * becomes a bare shell.
 */
export function derivePaneDisposition(pane: {
	agentId: string | null;
	agentSessionId: string | null;
	canResumeSession: boolean;
	foregroundCommand: string | null;
}): PaneDisposition {
	if (pane.agentId) {
		return pane.agentSessionId && pane.canResumeSession
			? { kind: "agent-resumes", agent: pane.agentId }
			: { kind: "agent-restarts", agent: pane.agentId };
	}
	if (pane.foregroundCommand) {
		return { kind: "process-restarts", command: pane.foregroundCommand };
	}
	return { kind: "shell-opens" };
}

/**
 * The steps a run moves through, in order. This list is the progress UI, the
 * failure vocabulary, and the documentation of what a teleport does — which
 * is why it is one array rather than three.
 */
export const TELEPORT_STEPS = [
	"handoff",
	"capture",
	"createWorktree",
	"restore",
	"setup",
	"tabs",
	"stopSource",
	"launch",
] as const;

export type TeleportStepId = (typeof TELEPORT_STEPS)[number];

/**
 * Where a capture's bundle is written. Named by workspace so a retry
 * overwrites its own file rather than accumulating one per attempt, and
 * carried in the ref namespace so a stray file is identifiable.
 */
export function handoffBundleName(workspaceId: string): string {
	return `superset-teleport-${workspaceId}.bundle`;
}

/**
 * The shell that puts a published capture back into a checkout that can
 * reach origin. It is what a destination runs when nothing newer than git is
 * installed there — a fresh sandbox, or a host on a release without
 * `teleport.restore`. Prints one `TELEPORT_RESTORED <n> files` line, which is
 * what a caller watches for.
 */
export function buildArrivalCommand(ref: string, branch: string): string {
	const q = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;
	return [
		`git fetch -q origin ${q(`${ref}:${ref}`)}`,
		`git checkout -q -B ${q(branch)} ${q(`${ref}~2`)}`,
		`git read-tree -m -u HEAD ${q(ref)}`,
		`git read-tree ${q(`${ref}^`)}`,
		`git update-ref -d ${q(ref)}`,
		"git update-index -q --refresh || true",
		`echo "TELEPORT_RESTORED $(git status --porcelain=v1 --untracked-files=all | wc -l | tr -d ' ') files on $(git branch --show-current) @ $(git rev-parse --short HEAD)"`,
	].join(" && ");
}

/** The marker a successful arrival prints; `n` is the dirty-file count. */
export const ARRIVAL_MARKER =
	/TELEPORT_RESTORED (\d+) files on (\S+) @ ([0-9a-f]+)/;
