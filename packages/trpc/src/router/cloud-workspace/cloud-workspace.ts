import { db } from "@superset/db/client";
import { cloudWorkspaces, environments } from "@superset/db/schema";
import { isCloudAgentId } from "@superset/shared/cloud-agent-launch";
import { SHARED_ENVIRONMENT_ORGANIZATION_ID } from "@superset/shared/constants";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { Client } from "@upstash/qstash";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import {
	cloudRepo,
	deleteSandbox,
	listRemoteBranches,
	mintPreviewAccess,
} from "../../lib/blaxel";
import { assertInternal, assertMember } from "../../lib/cloud-guards";
import { jwtProcedure, userError } from "../../trpc";
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

	listBranches: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				query: z.string().max(200).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			assertInternal(ctx.email);
			assertMember(ctx.organizationIds, input.organizationId);
			const repo = await cloudRepo();
			if (!repo) return { defaultBranch: null, items: [] };
			return listRemoteBranches(repo, input.query);
		}),

	/** The repository a cloud workspace clones, and its default branch. */
	repo: jwtProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			assertInternal(ctx.email);
			assertMember(ctx.organizationIds, input.organizationId);
			return cloudRepo();
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
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertInternal(ctx.email);
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
					inArray(environments.organizationId, [
						input.organizationId,
						SHARED_ENVIRONMENT_ORGANIZATION_ID,
					]),
					isNull(environments.archivedAt),
				),
			});
			if (!environment) {
				throw userError({
					code: "NOT_FOUND",
					message: "Environment not found in this organization",
					i18nKey: "serverError.cloudWorkspace.environmentNotFound",
				});
			}

			const branch =
				input.branch ?? (await cloudRepo())?.defaultBranch ?? "main";

			// The id is generated here rather than by the database so the sandbox
			// name can be derived before the insert. A placeholder would briefly
			// leave two rows sharing ("blaxel", ""), which the unique constraint
			// rejects whenever two creates overlap.
			const id = crypto.randomUUID();
			const providerSandboxId = sandboxNameFor(id);
			const [row] = await db
				.insert(cloudWorkspaces)
				.values({
					id,
					organizationId: input.organizationId,
					name: input.name ?? FALLBACK_NAME,
					branch,
					provider: "blaxel",
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
							},
						}
					: {}),
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
				await db
					.update(cloudWorkspaces)
					.set({ status: "failed" })
					.where(eq(cloudWorkspaces.id, row.id));
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
			assertInternal(ctx.email);
			assertMember(ctx.organizationIds, row.organizationId);
			const [renamed] = await db
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
				throw userError({
					code: "NOT_FOUND",
					message: "Not found",
					i18nKey: "serverError.cloudWorkspace.notFound",
				});
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
			await db
				.update(cloudWorkspaces)
				.set({ status: "deleted", sandboxUrl: null })
				.where(eq(cloudWorkspaces.id, row.id));
			return { deleted: true };
		}),
} satisfies TRPCRouterRecord;
