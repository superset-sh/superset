import { db } from "@superset/db/client";
import { cloudWorkspaces, environments } from "@superset/db/schema";
import {
	SANDBOX_IMAGE_NAME,
	SHARED_ENVIRONMENT_ORGANIZATION_ID,
} from "@superset/shared/constants";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { promoteSandboxToEnvironment } from "../../lib/blaxel";
import { assertInternal, assertMember } from "../../lib/cloud-guards";
import { jwtProcedure, userError } from "../../trpc";
import { secretsRouter } from "./secrets";

export async function loadEnvironment(id: string, organizationIds: string[]) {
	const row = await db.query.environments.findFirst({
		where: and(eq(environments.id, id), isNull(environments.archivedAt)),
	});
	if (!row) {
		throw userError({
			code: "NOT_FOUND",
			message: "Environment not found",
			i18nKey: "serverError.environment.environmentNotFound",
		});
	}
	if (row.organizationId !== SHARED_ENVIRONMENT_ORGANIZATION_ID) {
		assertMember(organizationIds, row.organizationId);
	}
	return row;
}

export function isSharedEnvironment(row: { organizationId: string }): boolean {
	return row.organizationId === SHARED_ENVIRONMENT_ORGANIZATION_ID;
}

export function secretOwnerOrganizationId(
	row: { organizationId: string },
	activeOrganizationId: string | null,
): string {
	if (!isSharedEnvironment(row)) return row.organizationId;
	if (!activeOrganizationId) {
		throw userError({
			code: "BAD_REQUEST",
			message: "No active organization",
			i18nKey: "serverError.environment.noActiveOrganization",
		});
	}
	return activeOrganizationId;
}

function assertOwned(row: { organizationId: string }): void {
	if (isSharedEnvironment(row)) {
		throw userError({
			code: "FORBIDDEN",
			message: "This environment is managed by Superset and cannot be changed",
			i18nKey: "serverError.environment.sharedEnvironmentIsReadOnly",
		});
	}
}

export const environmentRouter = {
	secrets: secretsRouter,

	list: jwtProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			assertInternal(ctx.email);
			assertMember(ctx.organizationIds, input.organizationId);
			return db
				.select()
				.from(environments)
				.where(
					and(
						inArray(environments.organizationId, [
							input.organizationId,
							SHARED_ENVIRONMENT_ORGANIZATION_ID,
						]),
						isNull(environments.archivedAt),
					),
				)
				.orderBy(asc(environments.name));
		}),

	get: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			assertInternal(ctx.email);
			return loadEnvironment(input.id, ctx.organizationIds);
		}),

	create: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().min(1).max(100),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertInternal(ctx.email);
			assertMember(ctx.organizationIds, input.organizationId);
			const [row] = await db
				.insert(environments)
				.values({
					organizationId: input.organizationId,
					name: input.name,
					provider: "blaxel",
					sourceKind: "image",
					sourceRef: SANDBOX_IMAGE_NAME,
				})
				.returning();
			return row;
		}),

	promote: jwtProcedure
		.input(
			z.object({
				cloudWorkspaceId: z.string().uuid(),
				name: z.string().min(1).max(100),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertInternal(ctx.email);
			const workspace = await db.query.cloudWorkspaces.findFirst({
				where: eq(cloudWorkspaces.id, input.cloudWorkspaceId),
			});
			if (!workspace) {
				throw userError({
					code: "NOT_FOUND",
					message: "Cloud workspace not found",
					i18nKey: "serverError.environment.cloudWorkspaceNotFound",
				});
			}
			assertMember(ctx.organizationIds, workspace.organizationId);
			if (workspace.status !== "ready") {
				throw userError({
					code: "PRECONDITION_FAILED",
					message: "Only a ready workspace can become an environment",
					i18nKey: "serverError.environment.workspaceNotReady",
				});
			}

			const environmentId = crypto.randomUUID();
			const goldenName = `env-${environmentId.replaceAll("-", "").slice(0, 24)}`;
			await promoteSandboxToEnvironment({
				sourceSandbox: workspace.providerSandboxId,
				goldenName,
			});

			const [row] = await db
				.insert(environments)
				.values({
					id: environmentId,
					organizationId: workspace.organizationId,
					name: input.name,
					provider: workspace.provider,
					sourceKind: "fork",
					sourceRef: goldenName,
				})
				.returning();
			return row;
		}),

	update: jwtProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).max(100).optional(),
				sourceRef: z.string().min(1).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertInternal(ctx.email);
			assertOwned(await loadEnvironment(input.id, ctx.organizationIds));
			const [row] = await db
				.update(environments)
				.set({
					...(input.name ? { name: input.name } : {}),
					...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
				})
				.where(eq(environments.id, input.id))
				.returning();
			return row;
		}),

	archive: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			assertInternal(ctx.email);
			assertOwned(await loadEnvironment(input.id, ctx.organizationIds));
			await db
				.update(environments)
				.set({ archivedAt: new Date() })
				.where(eq(environments.id, input.id));
			return { archived: true };
		}),
} satisfies TRPCRouterRecord;
