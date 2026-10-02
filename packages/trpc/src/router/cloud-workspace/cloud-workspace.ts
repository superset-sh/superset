import { db } from "@superset/db/client";
import {
	cloudWorkspacePresence,
	cloudWorkspaceRepositories,
	cloudWorkspaces,
	cloudWorkspaceVisibilityEnum,
	environments,
	githubRepositories,
	members,
	users,
} from "@superset/db/schema";
import {
	CLOUD_AGENT_PROMPT_MAX_LENGTH,
	isCloudAgentId,
} from "@superset/shared/cloud-agent-launch";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { assertCloudAccess, assertMember } from "../../lib/cloud-guards";
import { nudge } from "../../lib/realtime";
import {
	deleteSandbox,
	describeSandbox,
	HOST_SERVICE_PORT,
	listRemoteBranches,
	loadRepositories,
	mintSandboxGateAccess,
	primaryRepository,
	SandboxNotReadyError,
	SandboxUnavailableError,
	sandboxExists,
	stopSandbox,
} from "../../lib/sandbox";
import { jwtProcedure, userError } from "../../trpc";
import { hostServiceMutation } from "../automation/relay-client";
import {
	isVisibleTo,
	loadVisibleWorkspace,
	notFound,
	visibleTo,
} from "./access";
import { recordCloudWorkspaceActivity } from "./activity";
import { nextSandboxNameFor } from "./provision";
import { queueReap } from "./reap";
import { cloudWorkspaceRecordRouter } from "./record";
import { queueProvision, startCloudWorkspace } from "./start";
import { transitionCloudWorkspace } from "./transition";
import {
	markSandboxUnavailable,
	restartCloudWorkspace,
	wakeCloudWorkspace,
} from "./wake";

const DESCRIPTION_PROMPT = [
	"Write this workspace's description for a teammate who has not seen it:",
	"what was asked, what is done, what is in progress or blocked, and any open pull requests.",
	'Read the git log, the diff against the default branch, and `gh pr list --head "$(git branch --show-current)"` to find out; do not change any files.',
	"Keep it to 2-4 sentences of markdown, and save it by piping it on stdin:",
	"`superset workspaces description set <<'EOF'` followed by the description and `EOF`.",
].join(" ");

/** The caller's cloud workspace, refused unless it exists, they may use it, and it is ready. */
async function loadReadyWorkspace(
	ctx: Parameters<typeof assertCloudAccess>[0] & { organizationIds: string[] },
	id: string,
) {
	const row = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, id),
	});
	if (!row) {
		throw userError({
			code: "NOT_FOUND",
			message: "Not found",
			i18nKey: "serverError.cloudWorkspace.notFound",
		});
	}
	await assertCloudAccess(ctx);
	assertMember(ctx.organizationIds, row.organizationId);
	if (!isVisibleTo(row, ctx.userId)) throw notFound();
	if (row.status !== "ready") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `Cloud workspace is ${row.status}`,
			cause: { kind: "CLOUD_WORKSPACE_NOT_READY", status: row.status },
		});
	}
	return row;
}

/**
 * Where this workspace's host-service answers. A wake resumes a stopped
 * session and records a moved address, and a restart stops a running one
 * first; a sandbox that can never resume turns the row failed, the state
 * clients already offer a way out of.
 */
async function addressSandbox(
	row: typeof cloudWorkspaces.$inferSelect,
	mode: "address" | "wake" | "restart",
): Promise<{
	hostTarget: string;
	running: boolean;
	agentCredentialsChanged: boolean;
}> {
	try {
		if (mode === "address") {
			return {
				...(await describeSandbox(row.providerSandboxId)),
				agentCredentialsChanged: false,
			};
		}
		const woken =
			mode === "restart"
				? await restartCloudWorkspace(row)
				: await wakeCloudWorkspace(row);
		return { ...woken, running: true };
	} catch (error) {
		if (error instanceof SandboxNotReadyError) {
			throw new TRPCError({
				code: "TIMEOUT",
				message: "Cloud workspace is still starting",
				cause: error,
			});
		}
		if (!(error instanceof SandboxUnavailableError)) throw error;
		await markSandboxUnavailable(row, error);
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Cloud workspace is failed",
			cause: { kind: "CLOUD_WORKSPACE_NOT_READY", status: "failed" },
		});
	}
}

/**
 * Current members who have opened the workspaces, most recently seen first.
 * The creator counts as present from the moment they created it.
 */
async function loadPresence(organizationId: string, workspaceIds: string[]) {
	if (workspaceIds.length === 0) return [];
	const isMember = (userId: typeof users.id) =>
		and(eq(members.userId, userId), eq(members.organizationId, organizationId));
	const [visits, creators] = await Promise.all([
		db
			.select({
				cloudWorkspaceId: cloudWorkspacePresence.cloudWorkspaceId,
				userId: cloudWorkspacePresence.userId,
				name: users.name,
				image: users.image,
				lastSeenAt: cloudWorkspacePresence.lastSeenAt,
			})
			.from(cloudWorkspacePresence)
			.innerJoin(users, eq(cloudWorkspacePresence.userId, users.id))
			.innerJoin(members, isMember(users.id))
			.where(inArray(cloudWorkspacePresence.cloudWorkspaceId, workspaceIds)),
		db
			.select({
				cloudWorkspaceId: cloudWorkspaces.id,
				userId: users.id,
				name: users.name,
				image: users.image,
				lastSeenAt: cloudWorkspaces.createdAt,
			})
			.from(cloudWorkspaces)
			.innerJoin(users, eq(cloudWorkspaces.createdByUserId, users.id))
			.innerJoin(members, isMember(users.id))
			.where(inArray(cloudWorkspaces.id, workspaceIds)),
	]);
	const visited = new Set(
		visits.map((visit) => `${visit.cloudWorkspaceId}:${visit.userId}`),
	);
	return [
		...visits,
		...creators.filter(
			(creator) =>
				!visited.has(`${creator.cloudWorkspaceId}:${creator.userId}`),
		),
	].sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
}

export const cloudWorkspaceRouter = {
	...cloudWorkspaceRecordRouter,

	/**
	 * Whether this account may use cloud workspaces. Clients decide their
	 * default location from it: a workspace command defaults to the cloud only
	 * for an account that can use it, so nobody else's commands change.
	 */
	available: jwtProcedure.query(async ({ ctx }) => {
		try {
			await assertCloudAccess(ctx);
			return { available: true };
		} catch {
			return { available: false };
		}
	}),

	list: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				archived: z.boolean().default(false),
			}),
		)
		.query(async ({ ctx, input }) => {
			await assertCloudAccess(ctx);
			assertMember(ctx.organizationIds, input.organizationId);
			const rows = await db
				.select({
					workspace: cloudWorkspaces,
					createdBy: { userId: users.id, name: users.name, image: users.image },
				})
				.from(cloudWorkspaces)
				.leftJoin(users, eq(cloudWorkspaces.createdByUserId, users.id))
				.where(
					and(
						eq(cloudWorkspaces.organizationId, input.organizationId),
						visibleTo(ctx.userId),
						// Deleted rows are never a workspace you can open, so they
						// are only listed when archived ones are asked for.
						// Everything else is listed from the moment it is created:
						// the client renders provisioning and failed rows off
						// `status` rather than being told they don't exist yet.
						input.archived
							? and(
									eq(cloudWorkspaces.status, "deleted"),
									// Rows deleted before archiving existed have no deletedAt and no box.
									isNotNull(cloudWorkspaces.deletedAt),
								)
							: ne(cloudWorkspaces.status, "deleted"),
					),
				)
				.orderBy(desc(cloudWorkspaces.createdAt));
			const presence = await loadPresence(
				input.organizationId,
				rows.map((r) => r.workspace.id),
			);
			return rows.map(({ workspace, createdBy }) => ({
				...workspace,
				createdBy,
				presence: presence
					.filter((p) => p.cloudWorkspaceId === workspace.id)
					.map(({ cloudWorkspaceId: _id, ...person }) => person),
			}));
		}),

	/**
	 * The repositories each listed workspace checked out, by name, the one it
	 * opens on marked primary.
	 */
	repositories: jwtProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await assertCloudAccess(ctx);
			assertMember(ctx.organizationIds, input.organizationId);
			const rows = await db
				.select({
					cloudWorkspaceId: cloudWorkspaceRepositories.cloudWorkspaceId,
					repositoryId: githubRepositories.id,
					fullName: githubRepositories.fullName,
					path: cloudWorkspaceRepositories.path,
					hooksRepositoryId: environments.hooksRepositoryId,
				})
				.from(cloudWorkspaceRepositories)
				.innerJoin(
					cloudWorkspaces,
					eq(cloudWorkspaceRepositories.cloudWorkspaceId, cloudWorkspaces.id),
				)
				.innerJoin(
					environments,
					eq(cloudWorkspaces.environmentId, environments.id),
				)
				.innerJoin(
					githubRepositories,
					eq(cloudWorkspaceRepositories.repositoryId, githubRepositories.id),
				)
				.where(
					and(
						eq(cloudWorkspaces.organizationId, input.organizationId),
						visibleTo(ctx.userId),
					),
				)
				.orderBy(asc(githubRepositories.fullName));
			const primaryByWorkspace = new Map<string, string>();
			for (const workspaceId of new Set(rows.map((r) => r.cloudWorkspaceId))) {
				const own = rows.filter((r) => r.cloudWorkspaceId === workspaceId);
				const primary = primaryRepository(
					own.map((r) => ({ id: r.repositoryId, fullName: r.fullName })),
					own[0]?.hooksRepositoryId,
				);
				if (primary) primaryByWorkspace.set(workspaceId, primary.id);
			}
			return rows.map(({ hooksRepositoryId: _hooks, ...row }) => ({
				...row,
				primary:
					primaryByWorkspace.get(row.cloudWorkspaceId) === row.repositoryId,
			}));
		}),

	listBranches: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				repositoryId: z.string().uuid(),
				query: z.string().max(200).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			await assertCloudAccess(ctx);
			assertMember(ctx.organizationIds, input.organizationId);
			const [repo] = await loadRepositories({
				organizationId: input.organizationId,
				repositoryIds: [input.repositoryId],
			}).catch(() => []);
			if (!repo) return { defaultBranch: null, items: [] };
			return listRemoteBranches(repo, input.query);
		}),

	/** See {@link startCloudWorkspace}. */
	create: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				/** Omitted when the user didn't type one; then `prompt` names it. */
				name: z.string().min(1).max(200).optional(),
				prompt: z.string().max(CLOUD_AGENT_PROMPT_MAX_LENGTH).optional(),
				/** Omitted = the repo's default branch, resolved here — a client
				 * whose branch query hadn't answered must not guess "main". */
				branch: z.string().min(1).max(300).optional(),
				environmentId: z.string().uuid(),
				/**
				 * A built-in agent to launch on first boot with `prompt`. Absent
				 * means the workspace comes up idle.
				 */
				agent: z.string().min(1).optional(),
				model: z.string().min(1).optional(),
				effort: z.string().min(1).optional(),
				mode: z.string().min(1).optional(),
				/**
				 * Cloud uploads to hand the agent with `prompt`. The box pulls the
				 * bytes once it is up; the same cap `attachments.importFromCloud`
				 * takes, since that is what runs in there.
				 */
				attachmentFileIds: z.array(z.string().uuid()).max(10).optional(),
				/** What the person typed, kept as the workspace's prompt; `prompt` may carry built context. */
				typedPrompt: z.string().max(20000).optional(),
				/** Tasks the composer linked; each must be in this organization. */
				taskIds: z.array(z.string().uuid()).max(10).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await assertCloudAccess(ctx);
			assertMember(ctx.organizationIds, input.organizationId);
			if (input.agent && !isCloudAgentId(input.agent)) {
				// Only the built-in presets exist inside a sandbox; the clients offer
				// nothing else, so this is a developer error, not a user one.
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Unknown agent "${input.agent}"`,
				});
			}

			const row = await startCloudWorkspace({
				organizationId: input.organizationId,
				userId: ctx.userId,
				environmentId: input.environmentId,
				name: input.name,
				prompt: input.prompt,
				branch: input.branch,
				typedPrompt: input.typedPrompt,
				taskIds: input.taskIds,
				attachmentFileIds: input.attachmentFileIds,
				...(input.agent
					? {
							launch: {
								agent: input.agent,
								prompt: input.prompt ?? "",
								model: input.model,
								effort: input.effort,
								mode: input.mode,
								attachmentFileIds: input.attachmentFileIds,
							},
						}
					: {}),
			});
			// Shaped like a `list` row: clients seed the list with it.
			const creator = await db.query.users.findFirst({
				where: eq(users.id, ctx.userId),
				columns: { id: true, name: true, image: true },
			});
			return {
				...row,
				createdBy: creator
					? { userId: creator.id, name: creator.name, image: creator.image }
					: null,
				presence: [],
			};
		}),

	/**
	 * The workspace's name lives here, not on the sandbox. A cloud workspace
	 * is created, named and listed by this API; the row inside the sandbox
	 * exists only so host-service has something to serve panes against.
	 */
	rename: jwtProcedure
		.input(
			z.object({ id: z.string().uuid(), name: z.string().min(1).max(200) }),
		)
		.mutation(async ({ ctx, input }) => {
			const row = await loadVisibleWorkspace(ctx, input.id);
			const [renamed] = await db
				.update(cloudWorkspaces)
				.set({ name: input.name })
				.where(eq(cloudWorkspaces.id, input.id))
				.returning();
			if (input.name !== row.name) {
				await recordCloudWorkspaceActivity(
					db,
					row.id,
					{ kind: "user", userId: ctx.userId },
					{ fromName: row.name, toName: input.name },
				);
			}
			nudge(row.organizationId, "cloud_workspaces");
			return renamed ?? row;
		}),

	/**
	 * Checks org membership, then mints the tickets for this workspace's ports.
	 *
	 * This is the *only* gate. A sandbox's ports are public URLs; the gate
	 * Worker admits a request by ticket and presents the host secret to the
	 * box, so whoever holds an unexpired ticket has terminals, git, files and
	 * the desktop. Hence the checks running before anything is minted.
	 *
	 * `wake` is the difference between addressing a workspace and using it: a
	 * client keeps a live address for everything it lists, and that must not
	 * keep every sandbox running. Only the open workspace asks to be woken,
	 * which resumes a stopped session, re-applies the credential rules,
	 * extends a running session, and pushes the managed environment again.
	 */
	access: jwtProcedure
		.input(
			z.object({ id: z.string().uuid(), wake: z.boolean().default(false) }),
		)
		.mutation(async ({ ctx, input }) => {
			const row = await loadReadyWorkspace(ctx, input.id);
			const address = await addressSandbox(
				row,
				input.wake ? "wake" : "address",
			);
			// Only the open workspace wakes; addressing a listed one is not
			// being in it.
			// Presence is a hint; this call is also the sandbox keepalive.
			if (input.wake) {
				try {
					const [visit] = await db
						.insert(cloudWorkspacePresence)
						.values({ cloudWorkspaceId: row.id, userId: ctx.userId })
						.onConflictDoUpdate({
							target: [
								cloudWorkspacePresence.cloudWorkspaceId,
								cloudWorkspacePresence.userId,
							],
							set: { lastSeenAt: new Date() },
						})
						.returning({ firstVisit: sql<boolean>`xmax = 0` });
					if (visit?.firstVisit && ctx.userId !== row.createdByUserId) {
						await recordCloudWorkspaceActivity(
							db,
							row.id,
							{ kind: "user", userId: ctx.userId },
							{ event: "joined" },
						);
					}
					nudge(row.organizationId, "cloud_workspaces", {
						kind: "cloud_workspaces",
						workspaceId: row.id,
						presence: (await loadPresence(row.organizationId, [row.id])).map(
							({ cloudWorkspaceId: _id, lastSeenAt, ...person }) => ({
								...person,
								lastSeenAt: lastSeenAt.getTime(),
							}),
						),
					});
				} catch (error) {
					console.error(
						`[cloud-workspace] ${row.id} presence write failed`,
						error,
					);
				}
			}
			const host = await mintSandboxGateAccess({
				workspaceId: row.id,
				userId: ctx.userId,
				port: HOST_SERVICE_PORT,
				target: address.hostTarget,
			});
			return {
				url: host.url,
				token: host.token,
				expiresAt: host.expiresAt,
				running: address.running,
				agentCredentialsChanged: address.agentCredentialsChanged,
				// The display is served by host-service too: same address, same
				// ticket. The sandbox's own desktop port is not published.
				desktop: { url: host.url, token: host.token },
			};
		}),

	/** Ends every terminal and agent on the box so they start again with the current agent sign-ins. */
	restart: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const row = await loadReadyWorkspace(ctx, input.id);
			await addressSandbox(row, "restart");
			return { restarted: true };
		}),

	/**
	 * A ticket for host-service in this workspace's sandbox at its last known
	 * address, without asking the provider. For callers that reach the box
	 * right away (CLI, MCP, SDK): a stopped sandbox, or one whose address moved
	 * on resume, does not answer it, and they then ask `access` with `wake`,
	 * which also records the current address.
	 */
	/**
	 * Asks an agent in the box to write the workspace's description; it saves it
	 * with `superset workspaces description set`, which lands as `setDescription`.
	 */
	generateDescription: jwtProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				agent: z.string().refine(isCloudAgentId).default("claude"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const row = await loadReadyWorkspace(ctx, input.id);
			const address = await addressSandbox(row, "wake");
			const host = await mintSandboxGateAccess({
				workspaceId: row.id,
				userId: ctx.userId,
				port: HOST_SERVICE_PORT,
				target: address.hostTarget,
			});
			await hostServiceMutation(
				{
					baseUrl: host.url,
					headers: { authorization: `Bearer ${host.token}` },
					timeoutMs: 60_000,
				},
				"agents.run",
				{ workspaceId: row.id, agent: input.agent, prompt: DESCRIPTION_PROMPT },
			);
			return { requestedAt: new Date(), previous: row.description };
		}),

	hostTicket: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const row = await loadReadyWorkspace(ctx, input.id);
			const target =
				row.sandboxUrl ??
				(await describeSandbox(row.providerSandboxId)).hostTarget;
			const host = await mintSandboxGateAccess({
				workspaceId: row.id,
				userId: ctx.userId,
				port: HOST_SERVICE_PORT,
				target,
			});
			return { url: host.url, token: host.token, expiresAt: host.expiresAt };
		}),

	setVisibility: jwtProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				visibility: cloudWorkspaceVisibilityEnum,
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const row = await loadVisibleWorkspace(ctx, input.id);
			if (row.createdByUserId !== ctx.userId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only the creator can change who sees a cloud workspace",
				});
			}
			await db
				.update(cloudWorkspaces)
				.set({ visibility: input.visibility })
				.where(eq(cloudWorkspaces.id, input.id));
			if (input.visibility !== row.visibility) {
				await recordCloudWorkspaceActivity(
					db,
					row.id,
					{ kind: "user", userId: ctx.userId },
					{ fromVisibility: row.visibility, toVisibility: input.visibility },
				);
			}
			nudge(row.organizationId, "cloud_workspaces");
			return { visibility: input.visibility };
		}),

	delete: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const row = await db.query.cloudWorkspaces.findFirst({
				where: eq(cloudWorkspaces.id, input.id),
			});
			if (!row) return { deleted: false };
			await assertCloudAccess(ctx);
			assertMember(ctx.organizationIds, row.organizationId);
			if (!isVisibleTo(row, ctx.userId)) return { deleted: false };

			// A row from a retired provider has no sandbox left to keep.
			const onVercel = row.provider === "vercel";
			// Stopped, not deleted: an unarchive inside the grace period resumes
			// it with its disk, and the reap deletes it after.
			if (onVercel) await stopSandbox(row.providerSandboxId);
			const archivedAt = new Date();
			// From any state, provisioning included: the job checks the row
			// before it marks it ready and tears its box down when this won.
			const archived = await transitionCloudWorkspace({
				id: row.id,
				from: ["provisioning", "ready", "failed"],
				to: "deleted",
				set: { sandboxUrl: null, deletedAt: archivedAt },
			});
			if (archived) {
				await recordCloudWorkspaceActivity(
					db,
					row.id,
					{ kind: "user", userId: ctx.userId },
					{ event: "archived" },
				);
				if (onVercel) {
					await queueReap({
						cloudWorkspaceId: row.id,
						archivedAt: archivedAt.toISOString(),
					}).catch(async (error) => {
						console.error(
							`[cloud-workspace] could not queue the reap for ${row.id}`,
							error,
						);
						await deleteSandbox(row.providerSandboxId);
					});
				}
			}
			nudge(row.organizationId, "cloud_workspaces");
			return { deleted: true };
		}),

	unarchive: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const row = await loadVisibleWorkspace(ctx, input.id);
			const resumable =
				row.status === "deleted" &&
				row.provider === "vercel" &&
				(await sandboxExists(row.providerSandboxId));
			// Inside the grace period the stopped box is still there and wakes
			// with its disk; after it, the row gets a fresh box from its
			// environment and nothing on the old disk comes back.
			const revived = await transitionCloudWorkspace(
				resumable
					? {
							id: row.id,
							from: ["deleted"],
							to: "ready",
							set: { deletedAt: null },
						}
					: {
							id: row.id,
							from: ["deleted"],
							to: "provisioning",
							set: {
								provider: "vercel",
								providerSandboxId: nextSandboxNameFor(row.id),
								sandboxUrl: null,
								deletedAt: null,
							},
						},
			);
			if (!revived) return { unarchived: false };
			await recordCloudWorkspaceActivity(
				db,
				row.id,
				{ kind: "user", userId: ctx.userId },
				{ event: "unarchived" },
			);
			nudge(row.organizationId, "cloud_workspaces");
			if (!resumable) await queueProvision({ cloudWorkspaceId: row.id });
			return { unarchived: true };
		}),
} satisfies TRPCRouterRecord;
