import {
	type InsertPlan,
	type PlanStatus,
	plans,
	projects,
} from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../../..";

const planStatusSchema = z.enum(["draft", "running", "paused", "completed"]);

export const createPlanCrudProcedures = () => {
	return router({
		/**
		 * Create a new plan for a project
		 */
		create: publicProcedure
			.input(
				z.object({
					projectId: z.string(),
					name: z.string().optional(),
				}),
			)
			.mutation(({ input }) => {
				// Verify project exists
				const project = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, input.projectId))
					.get();

				if (!project) {
					throw new Error(`Project ${input.projectId} not found`);
				}

				const newPlan: InsertPlan = {
					projectId: input.projectId,
					name: input.name ?? "Plan",
					status: "draft",
				};

				const result = localDb.insert(plans).values(newPlan).returning().get();
				return result;
			}),

		/**
		 * Get a plan by ID
		 */
		get: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				const plan = localDb
					.select()
					.from(plans)
					.where(eq(plans.id, input.id))
					.get();

				if (!plan) {
					throw new Error(`Plan ${input.id} not found`);
				}

				return plan;
			}),

		/**
		 * Get all plans
		 */
		getAll: publicProcedure.query(() => {
			return localDb
				.select()
				.from(plans)
				.all()
				.sort((a, b) => b.createdAt - a.createdAt);
		}),

		/**
		 * Get all plans for a project
		 */
		getByProject: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(({ input }) => {
				return localDb
					.select()
					.from(plans)
					.where(eq(plans.projectId, input.projectId))
					.all()
					.sort((a, b) => b.createdAt - a.createdAt);
			}),

		/**
		 * Get the active plan for a project (most recent non-completed)
		 */
		getActiveByProject: publicProcedure
			.input(z.object({ projectId: z.string() }))
			.query(({ input }) => {
				const projectPlans = localDb
					.select()
					.from(plans)
					.where(eq(plans.projectId, input.projectId))
					.all()
					.filter((p) => p.status !== "completed")
					.sort((a, b) => b.updatedAt - a.updatedAt);

				return projectPlans[0] ?? null;
			}),

		/**
		 * Update a plan
		 */
		update: publicProcedure
			.input(
				z.object({
					id: z.string(),
					name: z.string().optional(),
					status: planStatusSchema.optional(),
				}),
			)
			.mutation(({ input }) => {
				const { id, ...updates } = input;

				const existing = localDb
					.select()
					.from(plans)
					.where(eq(plans.id, id))
					.get();

				if (!existing) {
					throw new Error(`Plan ${id} not found`);
				}

				const result = localDb
					.update(plans)
					.set({
						...updates,
						status: updates.status as PlanStatus | undefined,
						updatedAt: Date.now(),
					})
					.where(eq(plans.id, id))
					.returning()
					.get();

				return result;
			}),

		/**
		 * Delete a plan and all its tasks
		 */
		delete: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const existing = localDb
					.select()
					.from(plans)
					.where(eq(plans.id, input.id))
					.get();

				if (!existing) {
					throw new Error(`Plan ${input.id} not found`);
				}

				// Cascade delete will handle planTasks, executionLogs
				localDb.delete(plans).where(eq(plans.id, input.id)).run();

				return { success: true };
			}),
	});
};
