import { db, dbWs } from "@superset/db/client";
import { cloudWorkspaces, v2Projects } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import {
	bootstrapSandbox,
	deleteSandbox,
	mintPreviewAccess,
	provisionSandbox,
} from "../../lib/blaxel";
import { resolveCloneTarget } from "../../lib/blaxel/clone-token";
import { jwtProcedure } from "../../trpc";

/** Derived from the row id so the name is stable and collision-free. */
function sandboxNameFor(cloudWorkspaceId: string): string {
	return `ws-${cloudWorkspaceId.replaceAll("-", "").slice(0, 24)}`;
}

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
						eq(cloudWorkspaces.status, "ready"),
					),
				)
				.orderBy(desc(cloudWorkspaces.createdAt));
		}),

	/**
	 * Provisions a sandbox and records it. The row is written **before** the
	 * provider call so a crash mid-provision leaves a `provisioning` row we
	 * can reconcile, rather than an orphaned sandbox nothing references.
	 */
	create: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				projectId: z.string().uuid(),
				name: z.string().min(1).max(200),
				branch: z.string().min(1).max(300),
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

			const [row] = await dbWs
				.insert(cloudWorkspaces)
				.values({
					organizationId: input.organizationId,
					projectId: input.projectId,
					name: input.name,
					branch: input.branch,
					provider: "blaxel",
					// Set below, once the row id it derives from exists.
					providerSandboxId: "",
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

			const providerSandboxId = sandboxNameFor(row.id);
			try {
				const sandbox = await provisionSandbox({
					name: providerSandboxId,
					image: env.BLAXEL_SANDBOX_IMAGE,
				});
				const clone = await resolveCloneTarget(input.projectId);
				if (!clone) {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: "Project has no repository to clone",
					});
				}
				await bootstrapSandbox({
					providerSandboxId,
					repoCloneUrl: clone.cloneUrl,
					cloneToken: clone.token,
					branch: input.branch,
					organizationId: input.organizationId,
					projectName: project.name,
					workspaceName: input.name,
					hostServiceSecret: env.SANDBOX_HOST_SERVICE_SECRET,
					apiUrl: env.NEXT_PUBLIC_API_URL,
					authToken: "sandbox",
				});
				const [ready] = await dbWs
					.update(cloudWorkspaces)
					.set({
						providerSandboxId: sandbox.providerSandboxId,
						sandboxUrl: sandbox.sandboxUrl,
						status: "ready",
					})
					.where(eq(cloudWorkspaces.id, row.id))
					.returning();
				return ready ?? row;
			} catch (error) {
				await dbWs
					.update(cloudWorkspaces)
					.set({ status: "failed", providerSandboxId })
					.where(eq(cloudWorkspaces.id, row.id));
				throw error;
			}
		}),

	/**
	 * Checks org membership, then mints a short-lived provider token. This is
	 * the outer of two independent gates: Blaxel's edge rejects requests
	 * without the token, and host-service still rejects them without its own
	 * secret, so a leaked token alone reaches nothing protected.
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
				// Both layers are required: the preview token gets a request past
				// the provider's edge, the secret past host-service itself.
				hostServiceSecret: env.SANDBOX_HOST_SERVICE_SECRET,
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
