import { db } from "@superset/db/client";
import type { AutomationRunErrorCode } from "@superset/db/enums";
import { automationRuns, automations } from "@superset/db/schema";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { isI18nErrorCause } from "../../i18n-error";
import { SandboxNotReadyError } from "../../lib/sandbox";
import { RelayDispatchError } from "./relay-client";

export type AgentRunResult = {
	kind: "terminal";
	sessionId: string;
	label: string;
};

/** Where a run's agent lives: a host's workspace or a cloud workspace. */
export type RunWorkspace =
	| { v2WorkspaceId: string }
	| { cloudWorkspaceId: string };

/** A dispatch failure that already knows which guidance a client should show. */
export class RunFailure extends Error {
	constructor(
		message: string,
		readonly code: AutomationRunErrorCode | null,
	) {
		super(message);
		this.name = "RunFailure";
	}
}

/**
 * The terminal this automation's own last run left in its pinned workspace,
 * for the host to deliver into instead of launching beside it.
 *
 * Deliberately the automation's own previous run rather than any live agent in
 * the workspace: a person may be working in there too, and a scheduled prompt
 * must never land in a session they started. An unpinned automation branches a
 * fresh workspace per run and so has nothing to continue.
 *
 * The host decides in the end — this only nominates, and a stale nomination
 * costs a launch, which is the old behaviour.
 */
export async function previousRunTerminal(
	automationId: string,
	workspace: RunWorkspace,
): Promise<string | undefined> {
	const [previous] = await db
		.select({ terminalSessionId: automationRuns.terminalSessionId })
		.from(automationRuns)
		.where(
			and(
				eq(automationRuns.automationId, automationId),
				"cloudWorkspaceId" in workspace
					? eq(automationRuns.cloudWorkspaceId, workspace.cloudWorkspaceId)
					: eq(automationRuns.v2WorkspaceId, workspace.v2WorkspaceId),
				eq(automationRuns.status, "dispatched"),
				eq(automationRuns.sessionKind, "terminal"),
				isNotNull(automationRuns.terminalSessionId),
			),
		)
		// createdAt rather than dispatchedAt: it matches automation_runs_history_idx.
		.orderBy(desc(automationRuns.createdAt))
		.limit(1);
	return previous?.terminalSessionId ?? undefined;
}

/** Moves a gone pin to `next`, or clears it, only if nobody re-pinned meanwhile. */
export async function replacePin(
	automationId: string,
	stale: RunWorkspace,
	next: string | null,
): Promise<void> {
	await db
		.update(automations)
		.set({
			...("cloudWorkspaceId" in stale
				? { cloudWorkspaceId: next }
				: { v2WorkspaceId: next }),
			continueAgentSession: false,
		})
		.where(
			and(
				eq(automations.id, automationId),
				"cloudWorkspaceId" in stale
					? eq(automations.cloudWorkspaceId, stale.cloudWorkspaceId)
					: eq(automations.v2WorkspaceId, stale.v2WorkspaceId),
			),
		);
}

/**
 * The pull request a GitHub event names, when its head is provably not a fork.
 *
 * Fork pull requests are refused for the same reason `includeForks` is a
 * literal false — their head is attacker-controlled content the agent would
 * then run in. Only a PR-shaped payload carries the head repository, and its
 * absence is not evidence of absence: an `issue_comment` on a fork PR is
 * indistinguishable from one on a local PR, which is why the matcher's
 * `isFork` is false for both. So this requires a positive "not a fork" rather
 * than refusing only an explicit one.
 */
export function nonForkPullRequest(event: {
	provider: string;
	payload: unknown;
}): { number: number; headRef: string | null } | null {
	if (event.provider !== "github") return null;
	const payload = event.payload as {
		pull_request?: {
			number?: number;
			head?: { ref?: string; repo?: { fork?: boolean } };
		};
	} | null;
	if (payload?.pull_request?.head?.repo?.fork !== false) return null;
	const number = payload.pull_request.number;
	if (number === undefined) return null;
	return { number, headRef: payload.pull_request.head.ref ?? null };
}

const CLOUD_ERROR_CODES: Record<string, AutomationRunErrorCode> = {
	"serverError.cloudWorkspace.cloudSandboxesAreInternalOnly":
		"cloud_access_denied",
	"serverError.cloudWorkspace.environmentNotFound":
		"cloud_environment_unusable",
	"serverError.cloudWorkspace.environmentHasNoRepositories":
		"cloud_environment_unusable",
};

/**
 * The failure, as something a client can branch on.
 *
 * A host's failures are matched on its wording here rather than in each
 * client: the desktop used to grep these strings itself, which breaks the
 * moment the message is translated, and left three packages coupled through
 * prose. This is still a string match, but it is one, on the server, next to
 * the transport that produced it — swap it for a typed cause once the host
 * floor carries one.
 */
export function classifyDispatchError(
	err: unknown,
): AutomationRunErrorCode | null {
	if (err instanceof RunFailure) return err.code;
	if (err instanceof SandboxNotReadyError) return "cloud_not_ready";
	if (err instanceof TRPCError && isI18nErrorCause(err.cause)) {
		return CLOUD_ERROR_CODES[err.cause.i18nKey] ?? null;
	}
	if (!(err instanceof RelayDispatchError)) return null;
	if (err.message.includes("No host agent config matching")) {
		return "agent_not_found";
	}
	if (err.status === 404 && err.message.includes("not found on this host")) {
		return "workspace_not_found";
	}
	return null;
}

export function describeError(err: unknown, context: string): string {
	if (err instanceof Error) return `${context}: ${err.message}`;
	return `${context}: unknown error`;
}
