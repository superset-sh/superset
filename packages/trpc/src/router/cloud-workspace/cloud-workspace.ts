import { db, dbWs } from "@superset/db/client";
import { cloudWorkspaces, v2Projects } from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "../../env";
import {
	deleteSandbox,
	mintPreviewAccess,
	provisionSandbox,
} from "../../lib/blaxel";
import { jwtProcedure } from "../../trpc";

/** Blaxel sandbox names are DNS-ish; keep them short, lowercase and stable. */
function sandboxNameFor(cloudWorkspaceId: string): string {
	return `ws-${cloudWorkspaceId.replaceAll("-", "").slice(0, 24)}`;
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
					// Derived from the row id, so the provider name is stable and
					// collision-free without a second identifier to reconcile.
					providerSandboxName: "",
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

			const providerSandboxName = sandboxNameFor(row.id);
			try {
				const sandbox = await provisionSandbox({
					name: providerSandboxName,
					image: env.BLAXEL_SANDBOX_IMAGE,
				});
				const [ready] = await dbWs
					.update(cloudWorkspaces)
					.set({
						providerSandboxName: sandbox.providerSandboxName,
						previewUrl: sandbox.previewUrl,
						region: sandbox.region,
						memoryMb: sandbox.memoryMb,
						status: "ready",
					})
					.where(eq(cloudWorkspaces.id, row.id))
					.returning();
				return ready ?? row;
			} catch (error) {
				await dbWs
					.update(cloudWorkspaces)
					.set({ status: "failed", providerSandboxName })
					.where(eq(cloudWorkspaces.id, row.id));
				throw error;
			}
		}),

	/**
	 * Brokers access: org membership is checked here, then a short-lived
	 * provider token is minted. This is the only authorization gate — the
	 * sandbox itself trusts whatever Blaxel's edge lets through.
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
			assertMember(ctx.organizationIds, row.organizationId);
			if (row.status !== "ready") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: `Cloud workspace is ${row.status}`,
					cause: { kind: "CLOUD_WORKSPACE_NOT_READY", status: row.status },
				});
			}
			const access = await mintPreviewAccess(row.providerSandboxName);
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
			assertMember(ctx.organizationIds, row.organizationId);

			if (row.providerSandboxName) {
				await deleteSandbox(row.providerSandboxName);
			}
			await dbWs
				.update(cloudWorkspaces)
				.set({ status: "deleted", previewUrl: null })
				.where(eq(cloudWorkspaces.id, row.id));
			return { deleted: true };
		}),
} satisfies TRPCRouterRecord;
