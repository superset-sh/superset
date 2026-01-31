import { db, dbWs } from "@superset/db/client";
import { repositories } from "@superset/db/schema";
import { getCurrentTxid } from "@superset/db/utils";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../../trpc";

export const repositoryRouter = {
	all: publicProcedure.query(() => {
		return db.query.repositories.findMany({
			orderBy: desc(repositories.createdAt),
			with: {
				organization: true,
			},
		});
	}),

	byId: publicProcedure.input(z.string().uuid()).query(({ input }) => {
		return db.query.repositories.findFirst({
			where: eq(repositories.id, input),
			with: {
				organization: true,
				tasks: true,
			},
		});
	}),

	byOrganization: publicProcedure
		.input(z.string().uuid())
		.query(({ input }) => {
			return db.query.repositories.findMany({
				where: eq(repositories.organizationId, input),
				orderBy: desc(repositories.createdAt),
			});
		}),

	byGitHub: publicProcedure
		.input(
			z.object({
				owner: z.string(),
				name: z.string(),
			}),
		)
		.query(({ input }) => {
			return db.query.repositories.findFirst({
				where: and(
					eq(repositories.repoOwner, input.owner),
					eq(repositories.repoName, input.name),
				),
				with: {
					organization: true,
				},
			});
		}),

	create: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().min(1),
				slug: z.string().min(1),
				repoUrl: z.string().url(),
				repoOwner: z.string().min(1),
				repoName: z.string().min(1),
				defaultBranch: z.string().default("main"),
			}),
		)
		.mutation(async ({ input }) => {
			const result = await dbWs.transaction(async (tx) => {
				const [repository] = await tx
					.insert(repositories)
					.values(input)
					.returning();

				const txid = await getCurrentTxid(tx);

				return { repository, txid };
			});

			return result;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().min(1).optional(),
				defaultBranch: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const { id, ...data } = input;

			const result = await dbWs.transaction(async (tx) => {
				const [repository] = await tx
					.update(repositories)
					.set(data)
					.where(eq(repositories.id, id))
					.returning();

				const txid = await getCurrentTxid(tx);

				return { repository, txid };
			});

			return result;
		}),

	delete: protectedProcedure
		.input(z.string().uuid())
		.mutation(async ({ input }) => {
			const result = await dbWs.transaction(async (tx) => {
				await tx.delete(repositories).where(eq(repositories.id, input));

				const txid = await getCurrentTxid(tx);

				return { txid };
			});

			return result;
		}),
} satisfies TRPCRouterRecord;
