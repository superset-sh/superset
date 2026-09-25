import { db } from "@superset/db/client";
import {
	cloudWorkspaceRepositories,
	cloudWorkspaces,
	environments,
	githubRepositories,
} from "@superset/db/schema";
import { isCloudAgentId } from "@superset/shared/cloud-agent-launch";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { Client } from "@upstash/qstash";
import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import { assertCloudAccess, assertMember } from "../../lib/cloud-guards";
import {
	githubRepositoriesOutOfReach,
	githubUserTokenFor,
} from "../../lib/github-user";
import { nudge } from "../../lib/realtime";
import {
	buildSandboxClaim,
	deleteSandbox,
	describeSandbox,
	environmentRepositoryRows,
	HOST_SERVICE_PORT,
	listRemoteBranches,
	loadRepositories,
	mintSandboxGateAccess,
	primaryRepository,
	recordWorkspaceRepositories,
	SandboxNotReadyError,
	SandboxUnavailableError,
	wakeSandbox,
	workspaceBranchName,
} from "../../lib/sandbox";
import { jwtProcedure, userError } from "../../trpc";
import {
	FALLBACK_NAME,
	provisionCloudWorkspace,
	sandboxNameFor,
} from "./provision";
import { transitionCloudWorkspace } from "./transition";

const qstash = new Client({ token: env.QSTASH_TOKEN });

const PROVISION_JOB_URL = `${env.NEXT_PUBLIC_API_URL}/api/cloud-workspaces/provision`;

/**
 * QStash only calls public URLs, so a local API would queue a job nothing ever
 * delivers. Run it in-process there instead — still detached, so the create
 * returns as fast as it does in production and the UI behaves the same.
 */
const isLocalApi = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(
	env.NEXT_PUBLIC_API_URL,
);

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
	if (row.status !== "ready") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `Cloud workspace is ${row.status}`,
			cause: { kind: "CLOUD_WORKSPACE_NOT_READY", status: row.status },
		});
	}
	return row;
}

export const cloudWorkspaceRouter = {
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
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await assertCloudAccess(ctx);
			assertMember(ctx.organizationIds, input.organizationId);
			return db
				.select()
				.from(cloudWorkspaces)
				.where(
					and(
						eq(cloudWorkspaces.organizationId, input.organizationId),
						// Deleted rows are kept briefly so a failed teardown is
						// visible, but they are never a workspace you can open.
						// Everything else is listed from the moment it is created:
						// the client renders provisioning and failed rows off
						// `status` rather than being told they don't exist yet.
						ne(cloudWorkspaces.status, "deleted"),
					),
				)
				.orderBy(desc(cloudWorkspaces.createdAt));
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
				.where(eq(cloudWorkspaces.organizationId, input.organizationId))
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

	/**
	 * Records a cloud workspace and hands the sandbox off to a background job.
	 *
	 * Returns as soon as the row exists — in `provisioning`, with no sandbox
	 * behind it yet — because the client opens the workspace on this id and
	 * shows the provisioning screen itself. Nobody should watch a spinner on a
	 * submit button while a sandbox and a naming model call happen behind it.
	 *
	 * The row is still written **before** anything is provisioned, so a crash
	 * mid-provision leaves a `provisioning` row we can reconcile, rather than
	 * an orphaned sandbox nothing references.
	 */
	create: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				/** Omitted when the user didn't type one; then `prompt` names it. */
				name: z.string().min(1).max(200).optional(),
				prompt: z.string().max(20000).optional(),
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

			const environment = await db.query.environments.findFirst({
				where: and(
					eq(environments.id, input.environmentId),
					eq(environments.organizationId, input.organizationId),
					isNull(environments.archivedAt),
				),
			});
			if (
				!environment ||
				(environment.scope === "personal" &&
					environment.createdByUserId !== ctx.userId)
			) {
				throw userError({
					code: "NOT_FOUND",
					message: "Environment not found in this organization",
					i18nKey: "serverError.cloudWorkspace.environmentNotFound",
				});
			}

			// A workspace is started from an environment, and the environment's
			// repositories are its checkouts.
			const repositories = await environmentRepositoryRows(environment.id);
			if (repositories.length === 0) {
				throw userError({
					code: "BAD_REQUEST",
					message:
						"This environment has no repositories. Create an environment with repositories in Settings, then start the workspace from it",
					i18nKey: "serverError.cloudWorkspace.environmentHasNoRepositories",
				});
			}
			const primary = primaryRepository(
				repositories,
				environment.hooksRepositoryId,
			) as (typeof repositories)[number];
			const branch = input.branch ?? primary.defaultBranch;
			// A connected person's workspace acts as them on GitHub, so a
			// repository they cannot see would fail to clone later; say so now.
			const githubToken = await githubUserTokenFor(ctx.userId);
			if (githubToken) {
				const outOfReach = await githubRepositoriesOutOfReach({
					token: githubToken,
					repositories,
				});
				if (outOfReach.length > 0) {
					throw userError({
						code: "FORBIDDEN",
						message: `Your GitHub account cannot reach ${outOfReach.join(", ")}`,
						i18nKey: "serverError.cloudWorkspace.githubRepositoryOutOfReach",
					});
				}
			}

			// The id is generated here rather than by the database so the sandbox
			// name can be derived before the insert. A placeholder would briefly
			// leave two rows sharing ("vercel", ""), which the unique constraint
			// rejects whenever two creates overlap.
			const id = crypto.randomUUID();
			const providerSandboxId = sandboxNameFor(id);
			const name = input.name ?? FALLBACK_NAME;
			const [row] = await db
				.insert(cloudWorkspaces)
				.values({
					id,
					organizationId: input.organizationId,
					name,
					branch: workspaceBranchName({ id, name }),
					baseBranch: branch,
					provider: "vercel",
					providerSandboxId,
					status: "provisioning",
					environmentId: environment.id,
					createdByUserId: ctx.userId,
				})
				.returning();
			if (!row) {
				throw userError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Could not record cloud workspace",
					i18nKey: "serverError.cloudWorkspace.couldNotRecordCloudWorkspace",
				});
			}
			await recordWorkspaceRepositories({
				cloudWorkspaceId: row.id,
				repositories,
			});

			// Naming reads the prompt, and only when the user didn't type a name.
			const job = {
				cloudWorkspaceId: row.id,
				...(input.name ? {} : { namingPrompt: input.prompt ?? "" }),
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
			};

			nudge(row.organizationId, "cloud_workspaces");
			if (isLocalApi) {
				void provisionCloudWorkspace(job).catch((error) => {
					console.error(
						`[cloud-workspace] provisioning threw for ${row.id}`,
						error,
					);
				});
				return row;
			}

			try {
				// Queued rather than fired off after the response: this runs on
				// Vercel, where the function is frozen the moment it replies, and
				// an unawaited promise dies with it. QStash also retries a delivery
				// the function never finished, which is exactly the failure that
				// stranded a row in `provisioning` when create still ran inline.
				await qstash.publishJSON({
					url: PROVISION_JOB_URL,
					body: job,
					retries: 2,
				});
			} catch (error) {
				// Nothing was provisioned, so there is no sandbox to tear down —
				// but the row must not sit in `provisioning` with no job coming.
				await transitionCloudWorkspace({
					id: row.id,
					from: ["provisioning"],
					to: "failed",
				});
				console.error(
					`[cloud-workspace] could not queue provisioning for ${row.id}`,
					error,
				);
				throw userError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Could not start cloud workspace provisioning",
					i18nKey:
						"serverError.cloudWorkspace.couldNotStartCloudWorkspaceProvisioning",
				});
			}

			return row;
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
			const row = await db.query.cloudWorkspaces.findFirst({
				where: eq(cloudWorkspaces.id, input.id),
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
			const [renamed] = await db
				.update(cloudWorkspaces)
				.set({ name: input.name })
				.where(eq(cloudWorkspaces.id, input.id))
				.returning();
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
			let address: {
				hostTarget: string;
				running: boolean;
			};
			try {
				if (input.wake) {
					const { claim } = await buildSandboxClaim({ row });
					const woken = await wakeSandbox({
						providerSandboxId: row.providerSandboxId,
						claim,
					});
					if (woken.hostTarget !== row.sandboxUrl) {
						await db
							.update(cloudWorkspaces)
							.set({ sandboxUrl: woken.hostTarget })
							.where(eq(cloudWorkspaces.id, row.id));
					}
					address = { ...woken, running: true };
				} else {
					address = await describeSandbox(row.providerSandboxId);
				}
			} catch (error) {
				if (error instanceof SandboxNotReadyError) {
					throw new TRPCError({
						code: "TIMEOUT",
						message: "Cloud workspace is still starting",
						cause: error,
					});
				}
				if (!(error instanceof SandboxUnavailableError)) throw error;
				// The sandbox is gone or can never resume. A `ready` row nothing
				// can open would sit in the sidebar forever; failed is the state
				// the client already renders with a way out.
				await transitionCloudWorkspace({
					id: row.id,
					from: ["ready"],
					to: "failed",
					set: { sandboxUrl: null },
				});
				nudge(row.organizationId, "cloud_workspaces");
				console.error(`[cloud-workspace] ${row.id} sandbox unavailable`, error);
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Cloud workspace is failed",
					cause: { kind: "CLOUD_WORKSPACE_NOT_READY", status: "failed" },
				});
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
				// The display is served by host-service too: same address, same
				// ticket. The sandbox's own desktop port is not published.
				desktop: { url: host.url, token: host.token },
			};
		}),

	/**
	 * A ticket for host-service in this workspace's sandbox at its last known
	 * address, without asking the provider. For callers that reach the box
	 * right away (CLI, MCP, SDK): a stopped sandbox, or one whose address moved
	 * on resume, does not answer it, and they then ask `access` with `wake`,
	 * which also records the current address.
	 */
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

	delete: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const row = await db.query.cloudWorkspaces.findFirst({
				where: eq(cloudWorkspaces.id, input.id),
			});
			if (!row) return { deleted: false };
			await assertCloudAccess(ctx);
			assertMember(ctx.organizationIds, row.organizationId);

			// A row from a retired provider has no sandbox left to delete.
			if (row.providerSandboxId && row.provider === "vercel") {
				await deleteSandbox(row.providerSandboxId);
			}
			// From any state, provisioning included: the job checks the row
			// before it marks it ready and tears its box down when this won.
			await transitionCloudWorkspace({
				id: row.id,
				from: ["provisioning", "ready", "failed"],
				to: "deleted",
				set: { sandboxUrl: null },
			});
			nudge(row.organizationId, "cloud_workspaces");
			return { deleted: true };
		}),
} satisfies TRPCRouterRecord;
