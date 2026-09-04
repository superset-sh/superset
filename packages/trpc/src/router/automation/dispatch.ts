import { mintUserJwt } from "@superset/auth/server";
import { db } from "@superset/db/client";
import {
	automationEvents,
	automationRuns,
	automations,
	githubRepositories,
	type SelectAutomation,
	users,
	v2Hosts,
	v2Projects,
	v2UsersHosts,
} from "@superset/db/schema";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import {
	deduplicateBranchName,
	sanitizeBranchNameWithMaxLength,
	slugifyForBranch,
} from "@superset/shared/workspace-launch";
import { and, eq, sql } from "drizzle-orm";
import { fetchRelayPresence } from "../../lib/relay-presence";
import { RelayDispatchError, relayMutation } from "./relay-client";
import { promptWithTriggerContext } from "./triggerContext";

type AgentRunResult = { kind: "terminal"; sessionId: string; label: string };

export type DispatchOutcome =
	| { status: "dispatched"; runId: string }
	| { status: "skipped_offline"; runId: string | null; error: string }
	| { status: "dispatch_failed"; runId: string | null; error: string }
	| { status: "conflict" };

/**
 * Only what dispatch actually reads. Deliberately excludes the schedule
 * columns, which live on the automation's trigger.
 */
export type DispatchableAutomation = Pick<
	SelectAutomation,
	| "id"
	| "name"
	| "organizationId"
	| "ownerUserId"
	| "agent"
	| "prompt"
	| "targetHostId"
	| "v2ProjectId"
	| "v2WorkspaceId"
	| "tags"
>;

/**
 * What caused this run: a schedule with a due minute (and the schedule trigger
 * that was due, when the caller knows it), or a matched event.
 */
export type DispatchCause =
	| { scheduledFor: Date; triggerId?: string; trigger?: null }
	| {
			scheduledFor?: null;
			triggerId?: null;
			trigger: { triggerId: string; eventId: string };
	  };

export type DispatchOptions = {
	automation: DispatchableAutomation;
	relayUrl: string;
} & DispatchCause;

type HostCandidate = Pick<
	typeof v2Hosts.$inferSelect,
	| "organizationId"
	| "machineId"
	| "name"
	| "wakeCommand"
	| "createdByUserId"
	| "createdAt"
	| "updatedAt"
>;

/**
 * Run one automation: resolve host, (maybe) create a workspace, start the
 * agent session. Writes an automation_runs row regardless of outcome. Does
 * NOT touch automations.next_run_at — that advancement is the caller's
 * concern (the cron advances on every tick; runNow intentionally leaves
 * the regular cadence alone).
 */
export async function dispatchAutomation(
	opts: DispatchOptions,
): Promise<DispatchOutcome> {
	const { automation, relayUrl } = opts;
	const cause = runCause(opts);

	// An automation created from the detail page starts without instructions; a
	// trigger can be armed before they're written, so refuse to run instead of
	// starting an agent session with an empty prompt.
	if (automation.prompt.trim().length === 0) {
		const error = "automation has no instructions";
		const inserted = await recordUndispatched(
			automation,
			cause,
			automation.targetHostId,
			"dispatch_failed",
			error,
		);
		return { status: "dispatch_failed", runId: inserted?.id ?? null, error };
	}

	const candidates = await resolveCandidateHosts(automation);
	if (candidates.length === 0) {
		const error = "no host available";
		const inserted = await recordUndispatched(
			automation,
			cause,
			null,
			"skipped_offline",
			error,
		);
		return { status: "skipped_offline", runId: inserted?.id ?? null, error };
	}

	const host = await pickOnlineHost(automation, relayUrl, candidates);
	if (!host) {
		const error = "target host offline";
		const inserted = await recordUndispatched(
			automation,
			cause,
			candidates[0]?.machineId ?? null,
			"skipped_offline",
			error,
		);
		return { status: "skipped_offline", runId: inserted?.id ?? null, error };
	}

	const [run] = await db
		.insert(automationRuns)
		.values({
			automationId: automation.id,
			organizationId: automation.organizationId,
			title: automation.name,
			...cause,
			hostId: host.machineId,
			status: "dispatching",
		})
		.onConflictDoNothing(runDedupTarget(cause))
		.returning();

	if (!run) return { status: "conflict" };

	let workspaceId: string | null = null;
	try {
		const [owner] = await db
			.select({ email: users.email })
			.from(users)
			.where(eq(users.id, automation.ownerUserId))
			.limit(1);

		const jwt = await mintUserJwt({
			userId: automation.ownerUserId,
			email: owner?.email,
			organizationIds: [automation.organizationId],
			scope: "automation-run",
			runId: run.id,
			ttlSeconds: 300,
		});

		const routingKey = buildHostRoutingKey(
			automation.organizationId,
			host.machineId,
		);

		const event = cause.eventId
			? ((await db.query.automationEvents.findFirst({
					where: eq(automationEvents.id, cause.eventId),
					columns: {
						provider: true,
						eventType: true,
						title: true,
						url: true,
						actorLogin: true,
						ref: true,
						repositoryId: true,
						payload: true,
						receivedAt: true,
					},
				})) ?? null)
			: null;
		const pullRequest = event
			? await pullRequestToCheckOut(event, automation.v2ProjectId)
			: null;

		const createFreshWorkspace = async () => {
			const created = await createWorkspaceOnHost({
				relayUrl,
				hostId: routingKey,
				jwt,
				projectId: automation.v2ProjectId,
				automation,
				runId: run.id,
				pullRequest,
			});
			return created.workspaceId;
		};

		const prompt = promptWithTriggerContext(
			automation.prompt,
			{
				automationId: automation.id,
				triggerId: cause.triggerId,
				scheduledFor: cause.scheduledFor,
			},
			event,
		);

		const runAgent = (targetWorkspaceId: string) =>
			runAgentOnHost({
				relayUrl,
				hostId: routingKey,
				jwt,
				workspaceId: targetWorkspaceId,
				agent: automation.agent,
				prompt,
			});

		workspaceId = automation.v2WorkspaceId ?? (await createFreshWorkspace());

		let result: AgentRunResult;
		try {
			result = await runAgent(workspaceId);
		} catch (err) {
			// Fall back only when the host says the pinned workspace is gone:
			// tRPC NOT_FOUND (404) naming the pinned id. Other NOT_FOUNDs
			// (agent config, attachments) rethrow.
			const stalePin = automation.v2WorkspaceId;
			const pinGone =
				stalePin !== null &&
				stalePin === workspaceId &&
				err instanceof RelayDispatchError &&
				err.status === 404 &&
				err.message.includes(stalePin);
			if (!pinGone) throw err;
			// Clear the pin (CAS so a concurrent repin is never erased) and use
			// a fresh workspace from here on.
			await db
				.update(automations)
				.set({ v2WorkspaceId: null })
				.where(
					and(
						eq(automations.id, automation.id),
						eq(automations.v2WorkspaceId, stalePin),
					),
				);
			// Don't let the outer catch record the dead id if fresh-create throws.
			workspaceId = null;
			workspaceId = await createFreshWorkspace();
			result = await runAgent(workspaceId);
		}

		await db
			.update(automationRuns)
			.set({
				status: "dispatched",
				sessionKind: result.kind,
				chatSessionId: null,
				terminalSessionId: result.sessionId,
				v2WorkspaceId: workspaceId,
				dispatchedAt: new Date(),
			})
			.where(eq(automationRuns.id, run.id));
	} catch (err) {
		const error = describeError(err, "dispatch");
		await db
			.update(automationRuns)
			.set({
				status: "dispatch_failed",
				v2WorkspaceId: workspaceId,
				error,
			})
			.where(eq(automationRuns.id, run.id));
		return { status: "dispatch_failed", runId: run.id, error };
	}

	return { status: "dispatched", runId: run.id };
}

async function resolveCandidateHosts(
	automation: DispatchableAutomation,
): Promise<HostCandidate[]> {
	if (automation.targetHostId) {
		const [host] = await db
			.select()
			.from(v2Hosts)
			.where(
				and(
					eq(v2Hosts.organizationId, automation.organizationId),
					eq(v2Hosts.machineId, automation.targetHostId),
				),
			)
			.limit(1);

		return host ? [host] : [];
	}

	return db
		.select({
			organizationId: v2Hosts.organizationId,
			machineId: v2Hosts.machineId,
			name: v2Hosts.name,
			wakeCommand: v2Hosts.wakeCommand,
			createdByUserId: v2Hosts.createdByUserId,
			createdAt: v2Hosts.createdAt,
			updatedAt: v2Hosts.updatedAt,
		})
		.from(v2Hosts)
		.innerJoin(
			v2UsersHosts,
			and(
				eq(v2UsersHosts.organizationId, v2Hosts.organizationId),
				eq(v2UsersHosts.hostId, v2Hosts.machineId),
			),
		)
		.where(
			and(
				eq(v2UsersHosts.userId, automation.ownerUserId),
				eq(v2Hosts.organizationId, automation.organizationId),
			),
		)
		.orderBy(v2Hosts.updatedAt);
}

/**
 * The relay's Durable Objects are the presence authority. First online
 * candidate wins, preserving the updatedAt ordering.
 */
async function pickOnlineHost(
	automation: DispatchableAutomation,
	relayUrl: string,
	candidates: HostCandidate[],
): Promise<HostCandidate | null> {
	const jwt = await mintUserJwt({
		userId: automation.ownerUserId,
		organizationIds: [automation.organizationId],
		scope: "automation-presence",
		ttlSeconds: 60,
	});
	const presence = await fetchRelayPresence(
		relayUrl,
		jwt,
		candidates.map((host) =>
			buildHostRoutingKey(host.organizationId, host.machineId),
		),
	);
	return (
		candidates.find((host) => {
			const info =
				presence?.[buildHostRoutingKey(host.organizationId, host.machineId)];
			return info?.online ?? false;
		}) ?? null
	);
}

/** The run row columns that identify the cause, in either shape. */
type RunCause = {
	scheduledFor: Date | null;
	triggerId: string | null;
	eventId: string | null;
};

function runCause(opts: DispatchCause): RunCause {
	if (opts.trigger) {
		return {
			scheduledFor: null,
			triggerId: opts.trigger.triggerId,
			eventId: opts.trigger.eventId,
		};
	}
	return {
		scheduledFor: opts.scheduledFor,
		triggerId: opts.triggerId ?? null,
		eventId: null,
	};
}

/**
 * The partial unique index a run of this shape can collide on:
 * automation_runs_schedule_dedup_idx for scheduled runs,
 * automation_runs_event_dedup_idx for event runs. Postgres only matches
 * ON CONFLICT against an index whose predicate the target clause repeats,
 * so the two shapes need different targets, not one that names both.
 */
function runDedupTarget(cause: RunCause) {
	return cause.eventId !== null
		? {
				target: [automationRuns.triggerId, automationRuns.eventId],
				where: sql`${automationRuns.eventId} IS NOT NULL`,
			}
		: {
				target: [automationRuns.automationId, automationRuns.scheduledFor],
				where: sql`${automationRuns.scheduledFor} IS NOT NULL`,
			};
}

/** Records a run that never reached a host, so the failure is visible. */
async function recordUndispatched(
	automation: DispatchableAutomation,
	cause: RunCause,
	hostId: string | null,
	status: "skipped_offline" | "dispatch_failed",
	error: string,
): Promise<{ id: string } | undefined> {
	const [row] = await db
		.insert(automationRuns)
		.values({
			automationId: automation.id,
			organizationId: automation.organizationId,
			title: automation.name,
			...cause,
			hostId,
			status,
			error,
		})
		.onConflictDoNothing(runDedupTarget(cause))
		.returning({ id: automationRuns.id });
	return row;
}

/**
 * The pull request a run should be checked out on, or null to branch fresh.
 *
 * Only for a GitHub event that names one, and only when the automation's
 * project really is that repository: a trigger watching one repo can dispatch
 * into a project pointed at another, and PR numbers are per-repository, so an
 * unchecked number would check out an unrelated pull request. Fork pull
 * requests are refused for the same reason `includeForks` is a literal false —
 * their head is attacker-controlled content the agent would then run in.
 *
 * `pr` has been on `workspaces.create` since 0.1.0, well under the host floor,
 * so there is no version to gate on.
 */
async function pullRequestToCheckOut(
	event: { provider: string; repositoryId: string | null; payload: unknown },
	projectId: string | null,
): Promise<number | null> {
	if (event.provider !== "github") return null;
	// A session automation has no project, and so no repository to check out in.
	if (projectId === null || event.repositoryId === null) return null;

	const payload = event.payload as {
		pull_request?: { number?: number; head?: { repo?: { fork?: boolean } } };
	} | null;
	// Only a PR-shaped payload carries the head repository, and its absence is
	// not evidence of absence: an `issue_comment` on a fork PR is
	// indistinguishable from one on a local PR, which is why the matcher's
	// `isFork` is false for both. So require a positive "not a fork" rather
	// than refusing only an explicit one — a comment event names a PR number
	// it cannot prove is safe, and must not check one out.
	if (payload?.pull_request?.head?.repo?.fork !== false) return null;
	const number = payload.pull_request.number;
	if (number === undefined) return null;

	const [project] = await db
		.select({ repoCloneUrl: v2Projects.repoCloneUrl })
		.from(v2Projects)
		.where(eq(v2Projects.id, projectId))
		.limit(1);
	const parsed = project?.repoCloneUrl
		? parseGitHubRemote(project.repoCloneUrl)
		: null;
	if (!parsed) return null;

	const [repository] = await db
		.select({ fullName: githubRepositories.fullName })
		.from(githubRepositories)
		.where(eq(githubRepositories.repoId, event.repositoryId))
		.limit(1);
	if (!repository) return null;

	// GitHub slugs are case-insensitive, on both sides of the comparison.
	return repository.fullName.toLowerCase() ===
		`${parsed.owner}/${parsed.name}`.toLowerCase()
		? number
		: null;
}

async function createWorkspaceOnHost(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	projectId: string | null;
	automation: DispatchableAutomation;
	runId: string;
	/** The event's pull request, checked out instead of a fresh branch. */
	pullRequest: number | null;
}): Promise<{ workspaceId: string }> {
	// Session automation: no project, no branch. The host allocates a managed
	// folder under ~/.superset/sessions and dedupes the name per run.
	if (args.projectId === null) {
		const result = await relayMutation<
			{ name: string; tags?: string[] },
			{ workspace: { id: string } }
		>(
			{
				relayUrl: args.relayUrl,
				hostId: args.hostId,
				jwt: args.jwt,
				timeoutMs: 90_000,
			},
			"workspaces.createSession",
			{
				name: args.automation.name.slice(0, 100),
				...(args.automation.tags.length > 0
					? { tags: args.automation.tags }
					: {}),
			},
		);
		return { workspaceId: result.workspace.id };
	}

	// Full-precision timestamp keeps branch names readable AND collision-free
	// for anything coarser than 1 second.
	// e.g. "2026-04-19-17-30-00"
	const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
	const baseSlug = slugifyForBranch(args.automation.name, 30);
	const candidateBranch = sanitizeBranchNameWithMaxLength(
		baseSlug ? `${baseSlug}-${timestamp}` : `automation-${timestamp}`,
		60,
	);
	const branchName = deduplicateBranchName(candidateBranch, []);
	const workspaceName = args.automation.name.slice(0, 100);
	// Captured: the null check above does not narrow a property read inside
	// the closure below.
	const projectId = args.projectId;

	const create = (target: { branch: string } | { pr: number }) =>
		relayMutation<
			{
				projectId: string;
				name: string;
				branch?: string;
				pr?: number;
				tags?: string[];
			},
			{
				workspace: {
					id: string;
					projectId: string;
					name: string;
					branch: string;
				};
				terminals: Array<{ terminalId: string; label?: string }>;
				agents: Array<unknown>;
				alreadyExists: boolean;
			}
		>(
			{
				relayUrl: args.relayUrl,
				hostId: args.hostId,
				jwt: args.jwt,
				// Workspace creation does git clone + worktree setup — bigger repos
				// can comfortably take >25s. Give it real room.
				timeoutMs: 90_000,
			},
			"workspaces.create",
			{
				projectId,
				name: workspaceName,
				...target,
				// An older host's create schema simply strips the unknown key.
				...(args.automation.tags.length > 0
					? { tags: args.automation.tags }
					: {}),
			},
		);

	if (args.pullRequest !== null) {
		try {
			// The host fetches the PR's verified head and reuses the workspace
			// already on that branch, so repeated events on one PR share it.
			const result = await create({ pr: args.pullRequest });
			return { workspaceId: result.workspace.id };
		} catch (err) {
			// Fall back only when the host itself answered and refused, which
			// is what a missing or expired `gh auth login` looks like. A
			// timeout or transport failure is not a RelayDispatchError and
			// leaves the workspace's existence unknown: branching fresh there
			// would orphan a PR workspace the host may have finished creating
			// and run the automation against the wrong target. Rethrow, so the
			// retry meets the host's own per-PR dedupe instead.
			if (!(err instanceof RelayDispatchError)) throw err;
			// Resolving a PR shells out to `gh`, which runs on the user's own
			// `gh auth login` and may be missing or expired on this host. A PR
			// we cannot check out must not turn a run that would otherwise have
			// worked into a failure: branch fresh instead, and let the agent
			// work from the PR its prompt already names.
			console.warn(
				`[automations] PR #${args.pullRequest} checkout failed for ${args.automation.id}; branching fresh:`,
				describeError(err, "pr checkout"),
			);
		}
	}

	const result = await create({ branch: branchName });
	return { workspaceId: result.workspace.id };
}

async function runAgentOnHost(args: {
	relayUrl: string;
	hostId: string;
	jwt: string;
	workspaceId: string;
	agent: string;
	prompt: string;
}): Promise<AgentRunResult> {
	return relayMutation<
		{
			workspaceId: string;
			agent: string;
			prompt: string;
		},
		AgentRunResult
	>(
		{ relayUrl: args.relayUrl, hostId: args.hostId, jwt: args.jwt },
		"agents.run",
		{
			workspaceId: args.workspaceId,
			agent: args.agent,
			prompt: args.prompt,
		},
	);
}

function describeError(err: unknown, context: string): string {
	if (err instanceof RelayDispatchError) return `${context}: ${err.message}`;
	if (err instanceof Error) return `${context}: ${err.message}`;
	return `${context}: unknown error`;
}
