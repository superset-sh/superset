import { db } from "@superset/db/client";
import {
	githubPullRequests,
	members,
	taskStatuses,
	tasks,
	users,
} from "@superset/db/schema";
import { escapeLikePattern } from "@superset/db/utils";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { assertMember } from "../../lib/cloud-guards";
import { jwtProcedure } from "../../trpc";

const PER_GROUP = 5;

export const mentionRouter = {
	/** People, tasks, and pull requests in the organization that match, for an @ menu. */
	search: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				query: z.string().trim().max(200),
			}),
		)
		.query(async ({ ctx, input }) => {
			assertMember(ctx.organizationIds, input.organizationId);
			const pattern = `%${escapeLikePattern(input.query)}%`;
			const number = /^#?(\d+)$/.exec(input.query)?.[1];

			const [people, taskRows, pullRequests] = await Promise.all([
				db
					.select({ id: users.id, name: users.name, image: users.image })
					.from(members)
					.innerJoin(users, eq(users.id, members.userId))
					.where(
						and(
							eq(members.organizationId, input.organizationId),
							input.query
								? or(ilike(users.name, pattern), ilike(users.email, pattern))
								: undefined,
						),
					)
					.orderBy(asc(users.name))
					.limit(PER_GROUP),
				db
					.select({
						id: tasks.id,
						slug: tasks.slug,
						externalProvider: tasks.externalProvider,
						externalKey: tasks.externalKey,
						title: tasks.title,
						status: {
							type: taskStatuses.type,
							color: taskStatuses.color,
							progressPercent: taskStatuses.progressPercent,
						},
					})
					.from(tasks)
					.innerJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
					.where(
						and(
							eq(tasks.organizationId, input.organizationId),
							isNull(tasks.deletedAt),
							input.query
								? or(
										ilike(tasks.title, pattern),
										ilike(tasks.slug, pattern),
										ilike(tasks.externalKey, pattern),
									)
								: undefined,
						),
					)
					// Not created_at: its global index sends Postgres through every org's tasks to find this one's newest.
					.orderBy(desc(tasks.updatedAt))
					.limit(PER_GROUP),
				db
					.select({
						id: githubPullRequests.id,
						number: githubPullRequests.prNumber,
						title: githubPullRequests.title,
						url: githubPullRequests.url,
						state: githubPullRequests.state,
						isDraft: githubPullRequests.isDraft,
					})
					.from(githubPullRequests)
					.where(
						and(
							eq(githubPullRequests.organizationId, input.organizationId),
							input.query
								? or(
										ilike(githubPullRequests.title, pattern),
										number
											? eq(githubPullRequests.prNumber, Number(number))
											: undefined,
									)
								: undefined,
						),
					)
					.orderBy(desc(githubPullRequests.updatedAt))
					.limit(PER_GROUP),
			]);

			return { people, tasks: taskRows, pullRequests };
		}),
} satisfies TRPCRouterRecord;
