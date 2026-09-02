import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { WorkspaceCreateSettledPayload } from "@superset/workspace-client";
import { TRPCClientError } from "@trpc/client";
import { useCallback } from "react";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostEventBus } from "renderer/lib/host-event-bus";
import {
	getHostServiceClientByUrl,
	type HostServiceClient,
} from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type {
	WorkspacesCreateAnyInput,
	WorkspacesCreateInput,
	WorkspacesCreateSessionInput,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useStarNagStore } from "renderer/stores/star-nag";
import { useWorkspaceTransactionsStore } from "./workspaceTransactions";
import { writeWorkspacePaneLayout } from "./writeWorkspacePaneLayout";

export type { WorkspacesCreateInput, WorkspacesCreateSessionInput };

export interface SubmitArgs {
	hostId: string;
	/** `projectId: null` routes to `workspaces.createSession`. */
	snapshot: WorkspacesCreateAnyInput;
}

export type SubmitOutcome =
	| { ok: true; workspaceId: string }
	| { ok: false; error: string };

export interface SubmitHandle {
	workspaceId: string;
	completed: Promise<SubmitOutcome>;
}

export interface UseWorkspaceCreatesApi {
	submit: (args: SubmitArgs) => SubmitHandle;
}

/** Sessions create a folder + git init — quick. A wedged transport must not
 * hold the pending-create UI forever. */
const SESSION_CREATE_TIMEOUT_MS = 30_000;
/** The enqueue call validates and returns — it does none of the git work. */
const ENQUEUE_TIMEOUT_MS = 15_000;
/** Backstop for a lost `workspace:create-settled` event (host restart or WS
 * drop mid-create). Sized for worktree adds on monorepo-scale repos. */
const CREATE_SETTLE_TIMEOUT_MS = 10 * 60_000;

/** What the completed-create pipeline needs, from either transport. */
interface CreateOutcome {
	workspace: { id: string; projectId: string | null };
	terminals: Array<{ terminalId: string; label?: string }>;
	agents: Array<
		| { ok: true; kind: "terminal"; sessionId: string; label: string }
		| { ok: false; error: string }
	>;
	/**
	 * Whether this create resolved to a pre-existing row rather than a new
	 * one. `undefined` means unknown (e.g. the settled event was lost and we
	 * recovered via a row probe) — callers that only care about genuinely
	 * new workspaces (e.g. the star-nag usage counter) must treat `undefined`
	 * the same as `true` (don't count it), never as `false`.
	 */
	alreadyExists?: boolean;
}

/** Older hosts don't have `workspaces.createEnqueued` yet. */
function isMissingProcedureError(error: unknown): boolean {
	return (
		error instanceof TRPCClientError &&
		/no procedure found on path/i.test(error.message)
	);
}

/** An `AbortSignal.timeout` firing — host reachable but slow, as opposed to
 * unreachable (network errors reject differently). */
function isTimeoutAbort(error: unknown): boolean {
	const cause = error instanceof TRPCClientError ? error.cause : error;
	return (
		cause instanceof DOMException &&
		(cause.name === "TimeoutError" || cause.name === "AbortError")
	);
}

/**
 * Bounded row-existence probe: did the host actually create this workspace?
 * "unknown" means the probe itself failed (transport/auth) — callers must not
 * treat that as absence.
 */
async function probeWorkspaceRow(
	client: HostServiceClient,
	workspaceId: string,
): Promise<"exists" | "absent" | "unknown"> {
	try {
		const existing = await client.workspace.get.query(
			{ id: workspaceId },
			{ signal: AbortSignal.timeout(15_000) },
		);
		return existing != null ? "exists" : "absent";
	} catch (error) {
		if (error instanceof TRPCClientError && error.data?.code === "NOT_FOUND") {
			return "absent";
		}
		return "unknown";
	}
}

/** A few spaced probes: a client-side timeout can race a create that hasn't
 * inserted its row yet. Resolves "exists" as soon as any probe sees the row. */
async function probeWorkspaceRowWithRetries(
	client: HostServiceClient,
	workspaceId: string,
	attempts = 3,
	delayMs = 4_000,
): Promise<"exists" | "absent" | "unknown"> {
	let last: "absent" | "unknown" = "absent";
	for (let attempt = 0; attempt < attempts; attempt++) {
		if (attempt > 0) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
		const result = await probeWorkspaceRow(client, workspaceId);
		if (result === "exists") return result;
		last = result;
	}
	return last;
}

/**
 * Enqueue the create and resolve from the `workspace:create-settled` event.
 * The synchronous `workspaces.create` mutation holds one of Chromium's six
 * pooled sockets for the whole create (minutes on big repos) and exceeds the
 * relay's 30s exchange cap outright; the enqueue variant returns immediately
 * and the result arrives over the eventBus WebSocket instead.
 */
async function createViaEnqueue(
	client: HostServiceClient,
	hostUrl: string,
	workspaceId: string,
	payload: WorkspacesCreateInput,
): Promise<CreateOutcome> {
	const bus = getHostEventBus(hostUrl);
	const releaseBus = bus.retain();
	let unsubscribe: () => void = () => {};
	try {
		// Subscribe before enqueueing so the settled event can't slip past.
		const settled = new Promise<WorkspaceCreateSettledPayload>((resolve) => {
			unsubscribe = bus.on(
				"workspace:create-settled",
				workspaceId,
				(_workspaceId, eventPayload) => resolve(eventPayload),
			);
		});

		try {
			await client.workspaces.createEnqueued.mutate(payload, {
				signal: AbortSignal.timeout(ENQUEUE_TIMEOUT_MS),
			});
		} catch (error) {
			if (isMissingProcedureError(error)) {
				// Legacy host: fall back to the long-held synchronous create.
				const result = await client.workspaces.create.mutate(payload);
				return result;
			}
			// A timed-out enqueue may still have reached the host (reachable but
			// slow — e.g. a saturated socket pool). Hard-failing here could tear
			// down a workspace the host is actually creating; fall through and
			// let the settled event / backstop decide. Anything else (network
			// error, rejection) is a definitive no-enqueue: fail now.
			if (!isTimeoutAbort(error)) throw error;
		}

		let backstopTimer: ReturnType<typeof setTimeout> | undefined;
		const outcome = await Promise.race([
			settled,
			new Promise<"timeout">((resolve) => {
				backstopTimer = setTimeout(
					() => resolve("timeout"),
					CREATE_SETTLE_TIMEOUT_MS,
				);
			}),
		]).finally(() => clearTimeout(backstopTimer));

		if (outcome === "timeout") {
			// The event was lost, not necessarily the create. If the row exists
			// the workspace is real — recover with an EMPTY pane seed rather
			// than tearing down a workspace the user can already see. Launched
			// terminals/agents aren't recoverable without the event; the
			// background-session auto-adopt path surfaces them on open.
			const row = await probeWorkspaceRow(client, workspaceId);
			if (row === "exists") {
				return {
					workspace: { id: workspaceId, projectId: payload.projectId },
					terminals: [],
					agents: [],
				};
			}
			throw new Error(
				row === "unknown"
					? "Timed out waiting for the host to create the workspace, and the host could not be reached to verify it"
					: "Timed out waiting for the host to create the workspace",
			);
		}

		if (!outcome.ok) {
			throw new Error(outcome.error ?? "Workspace creation failed");
		}
		return {
			workspace: {
				id: outcome.canonicalWorkspaceId ?? workspaceId,
				projectId: outcome.projectId,
			},
			terminals: outcome.terminals,
			agents: outcome.agents,
			alreadyExists: outcome.alreadyExists,
		};
	} finally {
		unsubscribe();
		releaseBus();
	}
}

export function useWorkspaceCreates(): UseWorkspaceCreatesApi {
	const hostService = useLocalHostService();
	const { machineId, activeHostUrl } = hostService;
	const { data: session } = authClient.useSession();
	const organizationId = useActiveOrganizationId();
	const userId = session?.user?.id ?? null;
	const collections = useCollections();
	const { cache: hostWorkspacesCache } = useHostWorkspaces();
	const relayUrl = useRelayUrl();
	const trackWorkspaceTransaction = useWorkspaceTransactionsStore(
		(state) => state.track,
	);
	const { data: waitForSetupBeforeAgent } =
		electronTrpc.settings.getWaitForSetupBeforeAgent.useQuery();

	const submit = useCallback(
		(args: SubmitArgs): SubmitHandle => {
			const { snapshot } = args;
			const workspaceId = snapshot.id;
			if (!workspaceId) {
				throw new Error("workspaces.create requires `id`");
			}

			const recordFailure = (error: string) => {
				if (collections.failedWorkspaceCreates.get(workspaceId)) {
					collections.failedWorkspaceCreates.delete(workspaceId);
				}
				collections.failedWorkspaceCreates.insert({
					id: workspaceId,
					hostId: args.hostId,
					input: snapshot,
					error,
					failedAt: new Date(),
				});
			};

			const deleteWorkspaceLocalState = (id: string) => {
				if (collections.v2WorkspaceLocalState.get(id)) {
					collections.v2WorkspaceLocalState.delete(id);
				}
			};

			const hostUrl = organizationId
				? resolveHostUrl({
						hostId: args.hostId,
						machineId,
						activeHostUrl,
						organizationId,
						relayUrl,
					})
				: null;

			if (!organizationId || !hostUrl) {
				const error = !organizationId
					? i18n._(
							msg({
								message: "No active organization",
							}),
						)
					: getHostServiceUnavailableMessage(hostService, {
							action: "createWorkspace",
						});
				recordFailure(error);
				return {
					workspaceId,
					completed: Promise.resolve<SubmitOutcome>({ ok: false, error }),
				};
			}

			if (collections.failedWorkspaceCreates.get(workspaceId)) {
				collections.failedWorkspaceCreates.delete(workspaceId);
			}

			const isSession = snapshot.projectId === null;
			const now = new Date();
			// Optimistic entry in the host's cached list; the host's
			// workspace:changed broadcast replaces it with the real row.
			hostWorkspacesCache.upsertWorkspace({
				id: workspaceId,
				organizationId,
				projectId: snapshot.projectId,
				hostId: args.hostId,
				name:
					snapshot.name ??
					("branch" in snapshot ? snapshot.branch : undefined) ??
					i18n._(
						msg({
							message: "New workspace",
						}),
					),
				branch:
					("branch" in snapshot ? snapshot.branch : undefined) ??
					snapshot.name ??
					i18n._(
						msg({
							message: "New workspace",
						}),
					),
				type: isSession ? "session" : "worktree",
				createdByUserId: userId,
				taskId: ("taskId" in snapshot ? snapshot.taskId : undefined) ?? null,
				createdAt: now,
				updatedAt: now,
				worktreePath: "",
				worktreeExists: true,
			});

			// The wait-for-setup gate is a desktop setting the host can't read;
			// send it with every agent-carrying create so the host chains the
			// agent behind the setup commands. On a cold cache the hook value is
			// still undefined — resolve it directly so an early create can't
			// silently skip the gate (failures fall back to default-off).
			const createPromise: Promise<CreateOutcome> = (async () => {
				const client = getHostServiceClientByUrl(hostUrl);
				if (snapshot.projectId === null) {
					// Sessions have no setup scripts, so no wait-for-setup gate —
					// and no git worktree work, so the synchronous mutation stays.
					const { projectId: _null, ...sessionInput } = snapshot;
					try {
						const result = await client.workspaces.createSession.mutate(
							sessionInput,
							{ signal: AbortSignal.timeout(SESSION_CREATE_TIMEOUT_MS) },
						);
						return result;
					} catch (error) {
						// The abort cancels the client, not the host — a slow but
						// ultimately successful session create must not be recorded
						// as failed (the row would pop back via workspace:changed).
						// Spaced probes cover a create that hasn't inserted its row
						// yet; the empty pane seed is healed by session auto-adopt.
						if (
							isTimeoutAbort(error) &&
							(await probeWorkspaceRowWithRetries(client, workspaceId)) ===
								"exists"
						) {
							return {
								workspace: { id: workspaceId, projectId: null },
								terminals: [],
								agents: [],
							};
						}
						throw error;
					}
				}
				let waitForSetup = waitForSetupBeforeAgent;
				if (waitForSetup === undefined && snapshot.agents?.length) {
					waitForSetup =
						await electronTrpcClient.settings.getWaitForSetupBeforeAgent
							.query()
							.catch(() => false);
				}
				const payload: WorkspacesCreateInput =
					snapshot.agents?.length && waitForSetup
						? { ...snapshot, waitForSetupBeforeAgents: true }
						: snapshot;
				return createViaEnqueue(client, hostUrl, workspaceId, payload);
			})();

			writeWorkspacePaneLayout(
				collections,
				{ id: workspaceId, projectId: snapshot.projectId },
				[],
				[],
			);

			const completed = createPromise
				.then<SubmitOutcome>((result) => {
					writeWorkspacePaneLayout(
						collections,
						{
							id: result.workspace.id,
							projectId: result.workspace.projectId,
						},
						result.terminals,
						result.agents,
					);
					if (result.workspace.id !== workspaceId) {
						deleteWorkspaceLocalState(workspaceId);
						hostWorkspacesCache.removeWorkspace(args.hostId, workspaceId);
					}
					// Only count genuinely new worktrees, never reopened ones or
					// project-less sessions (createSession has no alreadyExists signal,
					// so an undefined value here is treated as "don't count").
					if (
						result.workspace.projectId !== null &&
						result.alreadyExists === false
					) {
						useStarNagStore.getState().recordWorkspaceCreated();
					}
					return {
						ok: true,
						workspaceId: result.workspace.id,
					};
				})
				.catch<SubmitOutcome>((error: unknown) => {
					const message =
						error instanceof Error ? error.message : String(error);
					hostWorkspacesCache.removeWorkspace(args.hostId, workspaceId);
					deleteWorkspaceLocalState(workspaceId);
					recordFailure(message);
					return { ok: false, error: message };
				});

			// Track against `completed` (not the raw mutation promise) so the
			// pending-create UI holds until the resolved pane layout — agent and
			// terminal panes — has been written. The host broadcasts the workspace
			// row mid-create, before agents/terminals launch, so clearing any
			// earlier would drop the user into a briefly-empty workspace.
			trackWorkspaceTransaction(workspaceId, {
				id: workspaceId,
				state: "persisting",
				createdAt: now,
				mutations: [{ type: "insert" }],
				isPersisted: { promise: completed },
			});

			return { workspaceId, completed };
		},
		[
			machineId,
			activeHostUrl,
			organizationId,
			userId,
			collections,
			hostWorkspacesCache,
			relayUrl,
			hostService,
			trackWorkspaceTransaction,
			waitForSetupBeforeAgent,
		],
	);

	return { submit };
}
