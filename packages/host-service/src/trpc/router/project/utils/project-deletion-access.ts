import { getHostId } from "@superset/shared/host-info";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import type { HostDb } from "../../../../db";
import { projects, workspaces } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";

export interface ProjectDeletionEligibility {
	createdByCaller: boolean;
	otherUsersWorkspaceCount: number;
}

export function readProjectDeletionEligibility(
	db: HostDb,
	projectId: string,
	userId: string | undefined,
): ProjectDeletionEligibility | null {
	const project = db
		.select({ createdByUserId: projects.createdByUserId })
		.from(projects)
		.where(eq(projects.id, projectId))
		.get();
	if (!project) return null;
	const otherUsersWorkspaceCount = db
		.select({ createdByUserId: workspaces.createdByUserId })
		.from(workspaces)
		.where(
			and(eq(workspaces.projectId, projectId), isNull(workspaces.archivedAt)),
		)
		.all()
		.filter(
			(workspace) => !userId || workspace.createdByUserId !== userId,
		).length;
	return {
		createdByCaller: !!userId && project.createdByUserId === userId,
		otherUsersWorkspaceCount,
	};
}

export async function requireProjectDeletionAccess(
	ctx: Pick<HostServiceContext, "db" | "api" | "organizationId" | "userId">,
	projectId: string,
	acknowledgedOtherUsersWorkspaceCount?: number,
): Promise<void> {
	const { userId } = ctx;
	if (!userId) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "An authenticated user is required to delete a project",
		});
	}
	const eligibility = readProjectDeletionEligibility(ctx.db, projectId, userId);
	if (
		eligibility &&
		acknowledgedOtherUsersWorkspaceCount !== undefined &&
		eligibility.otherUsersWorkspaceCount > acknowledgedOtherUsersWorkspaceCount
	) {
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"Other people are using this project on this device. Review the warning and try again.",
		});
	}
	if (
		eligibility?.createdByCaller &&
		eligibility.otherUsersWorkspaceCount === 0
	)
		return;
	const access = await ctx.api.host.authorizeProjectDeletion
		.query(
			{ organizationId: ctx.organizationId, machineId: getHostId(), userId },
			{ signal: AbortSignal.timeout(10_000) },
		)
		.catch((error: unknown) => {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message:
					"Couldn't confirm you're an owner of this device. Check your connection and try again.",
				cause: error,
			});
		});
	if (access.allowed) return;
	throw new TRPCError({
		code: "FORBIDDEN",
		message: eligibility?.createdByCaller
			? "Other people have workspaces in this project, so only an owner can delete it"
			: "Only the project's creator or an owner can delete this project",
	});
}
