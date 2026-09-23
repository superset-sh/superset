import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	projectGroupMembers,
	projectGroups,
	projects,
	workspaces,
} from "../../../db/schema";
import {
	deduplicateFolderName,
	defaultFolderNameForRepo,
	sanitizeFolderName,
} from "../../../projects/project-folders";
import {
	getProjectGroup,
	listProjectGroups,
	type ProjectGroup,
	type ProjectGroupMember,
	reassignMemberPositions,
} from "../../../projects/project-groups";
import type { HostServiceContext } from "../../../types";
import { protectedProcedure, router } from "../../index";

const MAX_GROUP_NAME_LENGTH = 200;

const memberShape = z.object({
	id: z.string(),
	groupId: z.string(),
	projectId: z.string(),
	position: z.number(),
	folder: z.string(),
	baseBranch: z.string().nullable(),
});

const groupShape = z.object({
	id: z.string(),
	name: z.string(),
	icon: z.string().nullable(),
	color: z.string().nullable(),
	createdAt: z.number(),
	updatedAt: z.number(),
	members: z.array(memberShape),
});

export type ProjectGroupMemberResponse = z.infer<typeof memberShape>;
export type ProjectGroupResponse = z.infer<typeof groupShape>;

function toResponse(group: ProjectGroup): ProjectGroupResponse {
	return {
		id: group.id,
		name: group.name,
		icon: group.icon,
		color: group.color,
		createdAt: group.createdAt,
		updatedAt: group.updatedAt,
		members: group.members.map((member) => ({
			id: member.id,
			groupId: member.groupId,
			projectId: member.projectId,
			position: member.position,
			folder: member.folder,
			baseBranch: member.baseBranch,
		})),
	};
}

function requireGroup(ctx: HostServiceContext, groupId: string): ProjectGroup {
	const group = getProjectGroup(ctx.db, groupId);
	if (!group) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Project group not found: ${groupId}`,
		});
	}
	return group;
}

function requireGroupName(input: string): string {
	const trimmed = input.trim();
	if (!trimmed || trimmed.length > MAX_GROUP_NAME_LENGTH) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Name must be 1 to ${MAX_GROUP_NAME_LENGTH} characters`,
		});
	}
	return trimmed;
}

function requireFolderName(input: string): string {
	const sanitized = sanitizeFolderName(input);
	if (!sanitized) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Folder must be a single directory name of letters, digits, dot, dash or underscore",
		});
	}
	return sanitized;
}

function findMember(group: ProjectGroup, memberId: string): ProjectGroupMember {
	const member = group.members.find((candidate) => candidate.id === memberId);
	if (!member) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `Member not found in this group: ${memberId}`,
		});
	}
	return member;
}

export const projectGroupsRouter = router({
	list: protectedProcedure.query(
		({ ctx }): { groups: ProjectGroupResponse[] } => ({
			groups: listProjectGroups(ctx.db).map(toResponse),
		}),
	),

	get: protectedProcedure
		.input(z.object({ groupId: z.string().min(1) }))
		.query(({ ctx, input }): { group: ProjectGroupResponse } => ({
			group: toResponse(requireGroup(ctx, input.groupId)),
		})),

	create: protectedProcedure
		.input(z.object({ name: z.string().min(1) }))
		.mutation(({ ctx, input }): { group: ProjectGroupResponse } => {
			const name = requireGroupName(input.name);
			const now = Date.now();
			const id = randomUUID();
			ctx.db
				.insert(projectGroups)
				.values({ id, name, createdAt: now, updatedAt: now })
				.run();
			return { group: toResponse(requireGroup(ctx, id)) };
		}),

	rename: protectedProcedure
		.input(z.object({ groupId: z.string().min(1), name: z.string().min(1) }))
		.mutation(({ ctx, input }): { group: ProjectGroupResponse } => {
			requireGroup(ctx, input.groupId);
			ctx.db
				.update(projectGroups)
				.set({ name: requireGroupName(input.name), updatedAt: Date.now() })
				.where(eq(projectGroups.id, input.groupId))
				.run();
			return { group: toResponse(requireGroup(ctx, input.groupId)) };
		}),

	remove: protectedProcedure
		.input(z.object({ groupId: z.string().min(1) }))
		.mutation(({ ctx, input }): { groupId: string } => {
			requireGroup(ctx, input.groupId);
			ctx.db.transaction((tx) => {
				tx.update(workspaces)
					.set({ groupId: null })
					.where(eq(workspaces.groupId, input.groupId))
					.run();
				tx.delete(projectGroupMembers)
					.where(eq(projectGroupMembers.groupId, input.groupId))
					.run();
				tx.delete(projectGroups)
					.where(eq(projectGroups.id, input.groupId))
					.run();
			});
			return { groupId: input.groupId };
		}),

	addMember: protectedProcedure
		.input(
			z.object({
				groupId: z.string().min(1),
				projectId: z.string().min(1),
				folder: z.string().min(1).optional(),
				baseBranch: z.string().min(1).optional(),
			}),
		)
		.mutation(({ ctx, input }): { group: ProjectGroupResponse } => {
			const group = requireGroup(ctx, input.groupId);
			const project = ctx.db
				.select({ id: projects.id, repoPath: projects.repoPath })
				.from(projects)
				.where(eq(projects.id, input.projectId))
				.get();
			if (!project) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Project is not set up on this host",
				});
			}
			if (group.members.some((member) => member.projectId === project.id)) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "Project is already a member of this group",
				});
			}

			const requested = input.folder
				? requireFolderName(input.folder)
				: defaultFolderNameForRepo(project.repoPath);
			const folder = deduplicateFolderName(
				requested,
				group.members.map((member) => member.folder),
			);

			ctx.db
				.insert(projectGroupMembers)
				.values({
					id: randomUUID(),
					groupId: group.id,
					projectId: project.id,
					position: group.members.length,
					folder,
					baseBranch: input.baseBranch ?? null,
					createdAt: Date.now(),
				})
				.run();
			return { group: toResponse(requireGroup(ctx, group.id)) };
		}),

	removeMember: protectedProcedure
		.input(
			z.object({ groupId: z.string().min(1), memberId: z.string().min(1) }),
		)
		.mutation(({ ctx, input }): { group: ProjectGroupResponse } => {
			const group = requireGroup(ctx, input.groupId);
			const member = findMember(group, input.memberId);
			if (member.position === 0 && group.members.length > 1) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `"${member.folder}" is the primary folder — make another member primary first`,
				});
			}
			ctx.db
				.delete(projectGroupMembers)
				.where(
					and(
						eq(projectGroupMembers.id, member.id),
						eq(projectGroupMembers.groupId, group.id),
					),
				)
				.run();
			reassignMemberPositions(
				ctx.db,
				group.members
					.filter((candidate) => candidate.id !== member.id)
					.map((candidate) => candidate.id),
			);
			return { group: toResponse(requireGroup(ctx, group.id)) };
		}),

	setPrimary: protectedProcedure
		.input(
			z.object({ groupId: z.string().min(1), memberId: z.string().min(1) }),
		)
		.mutation(({ ctx, input }): { group: ProjectGroupResponse } => {
			const group = requireGroup(ctx, input.groupId);
			const member = findMember(group, input.memberId);
			if (member.position !== 0) {
				reassignMemberPositions(ctx.db, [
					member.id,
					...group.members
						.filter((candidate) => candidate.id !== member.id)
						.map((candidate) => candidate.id),
				]);
			}
			return { group: toResponse(requireGroup(ctx, group.id)) };
		}),
});
