import { db, dbWs } from "@superset/db/client";
import { cloudWorkspaces, v2Projects } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { Client } from "@upstash/qstash";
import { and, desc, eq, isNotNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import {
	deleteSandbox,
	listRemoteBranches,
	mintPreviewAccess,
	repoForProject,
} from "../../lib/blaxel";
import { jwtProcedure } from "../../trpc";
import {
	FALLBACK_NAME,
	provisionCloudWorkspace,
	sandboxNameFor,
} from "./provision";

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

/**
 * Cloud workspaces are internal-only while the sandbox path is unproven: a
 * failure here provisions real infrastructure and clones a customer's code
 * into it, so exposure is limited to us until it has run for a while.
 */
function assertInternal(email: string): void {
	if (!email.toLowerCase().endsWith("@superset.sh")) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Cloud workspaces are not available yet",
		});
	}
}

function assertMember(organizationIds: string[], organizationId: string): void {
	if (!organizationIds.includes(organizationId)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Not a member of this organization",
		});
	}
}

export const cloudWorkspaceRouter = {
	list: jwtProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			assertInternal(ctx.email);
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
	 * INTERIM until the environments entity replaces `project_id` — see
	 * docs/cloud-sandbox-considerations.md ("Model"). The projects a cloud
	 * workspace can be created from: the `v2_projects` rows that still carry
	 * a repo to clone. Desktop reads projects from the local host instead;
	 * a phone has no host, and this is its only source.
	 */
	listProjects: jwtProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			assertInternal(ctx.email);
			assertMember(ctx.organizationIds, input.organizationId);
			return db
				.select({
					id: v2Projects.id,
					name: v2Projects.name,
					iconUrl: v2Projects.iconUrl,
				})
				.from(v2Projects)
				.where(
					and(
						eq(v2Projects.organizationId, input.organizationId),
						// Without either there is no repo to resolve and create
						// would refuse the project anyway.
						or(
							isNotNull(v2Projects.githubRepositoryId),
							isNotNull(v2Projects.repoCloneUrl),
						),
					),
				)
				.orderBy(v2Projects.name);
		}),

	/**
	 * Branches from the GitHub remote via the App installation — the hostless
	 * counterpart of the desktop's local-`gh` listing.
	 */
	listBranches: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				projectId: z.string().uuid(),
				query: z.string().max(200).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			assertInternal(ctx.email);
			assertMember(ctx.organizationIds, input.organizationId);
			const project = await db.query.v2Projects.findFirst({
				where: and(
					eq(v2Projects.id, input.projectId),
					eq(v2Projects.organizationId, input.organizationId),
				),
			});
			if (!project) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found in this organization",
				});
			}
			return listRemoteBranches(input.projectId, input.query);
		}),

	/**
	 * The repo a cloud workspace would clone. Branch listing itself runs
	 * through the local host's `gh`, so this only resolves the coordinates.
	 */
	repoForProject: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				projectId: z.string().uuid(),
			}),
		)
		.query(async ({ ctx, input }) => {
			assertInternal(ctx.email);
			assertMember(ctx.organizationIds, input.organizationId);
			return repoForProject(input.projectId);
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
				projectId: z.string().uuid(),
				/** Omitted when the user didn't type one; then `prompt` names it. */
				name: z.string().min(1).max(200).optional(),
				prompt: z.string().max(20000).optional(),
				/** Omitted = the repo's default branch, resolved here — a client
				 * whose branch query hadn't answered must not guess "main". */
				branch: z.string().min(1).max(300).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertInternal(ctx.email);
			assertMember(ctx.organizationIds, input.organizationId);

			const project = await db.query.v2Projects.findFirst({
				where: and(
					eq(v2Projects.id, input.projectId),
					eq(v2Projects.organizationId, input.organizationId),
				),
			});
			if (!project) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project not found in this organization",
				});
			}

			const branch =
				input.branch ??
				(await repoForProject(input.projectId))?.defaultBranch ??
				"main";

			// The id is generated here rather than by the database so the sandbox
			// name can be derived before the insert. A placeholder would briefly
			// leave two rows sharing ("blaxel", ""), which the unique constraint
			// rejects whenever two creates overlap.
			const id = crypto.randomUUID();
			const providerSandboxId = sandboxNameFor(id);
			const [row] = await dbWs
				.insert(cloudWorkspaces)
				.values({
					id,
					organizationId: input.organizationId,
					projectId: input.projectId,
					name: input.name ?? FALLBACK_NAME,
					branch,
					provider: "blaxel",
					providerSandboxId,
					status: "provisioning",
					createdByUserId: ctx.userId,
				})
				.returning();
			if (!row) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Could not record cloud workspace",
				});
			}

			// Naming reads the prompt, and only when the user didn't type a name.
			const job = {
				cloudWorkspaceId: row.id,
				...(input.name ? {} : { namingPrompt: input.prompt ?? "" }),
			};

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
				await dbWs
					.update(cloudWorkspaces)
					.set({ status: "failed" })
					.where(eq(cloudWorkspaces.id, row.id));
				console.error(
					`[cloud-workspace] could not queue provisioning for ${row.id}`,
					error,
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Could not start cloud workspace provisioning",
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
				throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
			}
			assertInternal(ctx.email);
			assertMember(ctx.organizationIds, row.organizationId);
			const [renamed] = await dbWs
				.update(cloudWorkspaces)
				.set({ name: input.name })
				.where(eq(cloudWorkspaces.id, input.id))
				.returning();
			return renamed ?? row;
		}),

	/**
	 * Checks org membership, then mints a short-lived provider token.
	 *
	 * This is the *only* gate. host-service inside a sandbox trusts the
	 * provider's edge and checks nothing itself (`EdgeGuardedHostAuthProvider`),
	 * so this token is the whole of the sandbox's access control: whoever holds
	 * an unexpired one has terminals, git and the filesystem. Hence the short
	 * TTL, and hence the checks above running before it is minted rather than
	 * anywhere later.
	 */
	access: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const row = await db.query.cloudWorkspaces.findFirst({
				where: eq(cloudWorkspaces.id, input.id),
			});
			if (!row) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
			}
			assertInternal(ctx.email);
			assertMember(ctx.organizationIds, row.organizationId);
			if (row.status !== "ready") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: `Cloud workspace is ${row.status}`,
					cause: { kind: "CLOUD_WORKSPACE_NOT_READY", status: row.status },
				});
			}
			const access = await mintPreviewAccess(row.providerSandboxId);
			return {
				url: access.url,
				token: access.token,
				expiresAt: access.expiresAt,
			};
		}),

	delete: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const row = await db.query.cloudWorkspaces.findFirst({
				where: eq(cloudWorkspaces.id, input.id),
			});
			if (!row) return { deleted: false };
			assertInternal(ctx.email);
			assertMember(ctx.organizationIds, row.organizationId);

			if (row.providerSandboxId) {
				await deleteSandbox(row.providerSandboxId);
			}
			await dbWs
				.update(cloudWorkspaces)
				.set({ status: "deleted", sandboxUrl: null })
				.where(eq(cloudWorkspaces.id, row.id));
			return { deleted: true };
		}),
} satisfies TRPCRouterRecord;
