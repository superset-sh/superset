import {
	type InsertPlanTask,
	type PlanTaskStatus,
	type TaskPriority,
	planTasks,
	plans,
} from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { z } from "zod";
import { publicProcedure, router } from "../../..";

const taskStatusSchema = z.enum([
	"backlog",
	"queued",
	"running",
	"completed",
	"failed",
]);
const taskPrioritySchema = z.enum(["urgent", "high", "medium", "low", "none"]);

export const createPlanTaskProcedures = () => {
	return router({
		/**
		 * Create a new task in a plan
		 */
		createTask: publicProcedure
			.input(
				z.object({
					planId: z.string(),
					title: z.string(),
					description: z.string().optional(),
					priority: taskPrioritySchema.optional(),
					status: taskStatusSchema.optional(),
					// External sync fields
					externalProvider: z.enum(["linear"]).optional(),
					externalId: z.string().optional(),
					externalUrl: z.string().optional(),
				}),
			)
			.mutation(({ input }) => {
				// Verify plan exists
				const plan = localDb
					.select()
					.from(plans)
					.where(eq(plans.id, input.planId))
					.get();

				if (!plan) {
					throw new Error(`Plan ${input.planId} not found`);
				}

				// Get max columnOrder for this plan and status
				const status = input.status ?? "backlog";
				const existingTasks = localDb
					.select()
					.from(planTasks)
					.where(eq(planTasks.planId, input.planId))
					.all()
					.filter((t) => t.status === status);

				const maxOrder = Math.max(0, ...existingTasks.map((t) => t.columnOrder));

				const newTask: InsertPlanTask = {
					planId: input.planId,
					title: input.title,
					description: input.description,
					priority: (input.priority ?? "medium") as TaskPriority,
					status: status as PlanTaskStatus,
					columnOrder: maxOrder + 1,
					externalProvider: input.externalProvider,
					externalId: input.externalId,
					externalUrl: input.externalUrl,
				};

				const result = localDb
					.insert(planTasks)
					.values(newTask)
					.returning()
					.get();

				return result;
			}),

		/**
		 * Get all tasks for a plan, grouped by status
		 */
		getTasksByPlan: publicProcedure
			.input(z.object({ planId: z.string() }))
			.query(({ input }) => {
				const tasks = localDb
					.select()
					.from(planTasks)
					.where(eq(planTasks.planId, input.planId))
					.all()
					.sort((a, b) => a.columnOrder - b.columnOrder);

				// Group by status
				const grouped: Record<PlanTaskStatus, typeof tasks> = {
					backlog: [],
					queued: [],
					running: [],
					completed: [],
					failed: [],
				};

				for (const task of tasks) {
					const status = task.status as PlanTaskStatus;
					grouped[status].push(task);
				}

				return {
					tasks,
					grouped,
				};
			}),

		/**
		 * Get a single task by ID
		 */
		getTask: publicProcedure
			.input(z.object({ id: z.string() }))
			.query(({ input }) => {
				const task = localDb
					.select()
					.from(planTasks)
					.where(eq(planTasks.id, input.id))
					.get();

				if (!task) {
					throw new Error(`Task ${input.id} not found`);
				}

				return task;
			}),

		/**
		 * Update a task
		 */
		updateTask: publicProcedure
			.input(
				z.object({
					id: z.string(),
					title: z.string().optional(),
					description: z.string().optional(),
					priority: taskPrioritySchema.optional(),
					status: taskStatusSchema.optional(),
					columnOrder: z.number().optional(),
				}),
			)
			.mutation(({ input }) => {
				const { id, ...updates } = input;

				const existing = localDb
					.select()
					.from(planTasks)
					.where(eq(planTasks.id, id))
					.get();

				if (!existing) {
					throw new Error(`Task ${id} not found`);
				}

				const result = localDb
					.update(planTasks)
					.set({
						...updates,
						priority: updates.priority as TaskPriority | undefined,
						status: updates.status as PlanTaskStatus | undefined,
						updatedAt: Date.now(),
					})
					.where(eq(planTasks.id, id))
					.returning()
					.get();

				return result;
			}),

		/**
		 * Move a task to a new status/position
		 */
		moveTask: publicProcedure
			.input(
				z.object({
					id: z.string(),
					status: taskStatusSchema,
					columnOrder: z.number(),
				}),
			)
			.mutation(({ input }) => {
				const existing = localDb
					.select()
					.from(planTasks)
					.where(eq(planTasks.id, input.id))
					.get();

				if (!existing) {
					throw new Error(`Task ${input.id} not found`);
				}

				// Reorder other tasks in the target column
				const tasksInColumn = localDb
					.select()
					.from(planTasks)
					.where(eq(planTasks.planId, existing.planId))
					.all()
					.filter(
						(t) => t.status === input.status && t.id !== input.id,
					)
					.sort((a, b) => a.columnOrder - b.columnOrder);

				// Insert at the new position and shift others
				let order = 0;
				for (const task of tasksInColumn) {
					if (order === input.columnOrder) {
						order++; // Skip the position for the moved task
					}
					if (task.columnOrder !== order) {
						localDb
							.update(planTasks)
							.set({ columnOrder: order })
							.where(eq(planTasks.id, task.id))
							.run();
					}
					order++;
				}

				// Update the moved task
				const result = localDb
					.update(planTasks)
					.set({
						status: input.status as PlanTaskStatus,
						columnOrder: input.columnOrder,
						updatedAt: Date.now(),
					})
					.where(eq(planTasks.id, input.id))
					.returning()
					.get();

				return result;
			}),

		/**
		 * Delete a task
		 */
		deleteTask: publicProcedure
			.input(z.object({ id: z.string() }))
			.mutation(({ input }) => {
				const existing = localDb
					.select()
					.from(planTasks)
					.where(eq(planTasks.id, input.id))
					.get();

				if (!existing) {
					throw new Error(`Task ${input.id} not found`);
				}

				// Cascade delete will handle executionLogs
				localDb.delete(planTasks).where(eq(planTasks.id, input.id)).run();

				return { success: true };
			}),

		/**
		 * Bulk create tasks (for imports)
		 */
		bulkCreateTasks: publicProcedure
			.input(
				z.object({
					planId: z.string(),
					tasks: z.array(
						z.object({
							title: z.string(),
							description: z.string().optional(),
							priority: taskPrioritySchema.optional(),
							externalProvider: z.enum(["linear"]).optional(),
							externalId: z.string().optional(),
							externalUrl: z.string().optional(),
						}),
					),
				}),
			)
			.mutation(({ input }) => {
				// Verify plan exists
				const plan = localDb
					.select()
					.from(plans)
					.where(eq(plans.id, input.planId))
					.get();

				if (!plan) {
					throw new Error(`Plan ${input.planId} not found`);
				}

				// Get current max order
				const existingTasks = localDb
					.select()
					.from(planTasks)
					.where(eq(planTasks.planId, input.planId))
					.all()
					.filter((t) => t.status === "backlog");

				let nextOrder = Math.max(0, ...existingTasks.map((t) => t.columnOrder)) + 1;

				const createdTasks = [];
				for (const taskInput of input.tasks) {
					const newTask: InsertPlanTask = {
						planId: input.planId,
						title: taskInput.title,
						description: taskInput.description,
						priority: (taskInput.priority ?? "medium") as TaskPriority,
						status: "backlog",
						columnOrder: nextOrder++,
						externalProvider: taskInput.externalProvider,
						externalId: taskInput.externalId,
						externalUrl: taskInput.externalUrl,
					};

					const result = localDb
						.insert(planTasks)
						.values(newTask)
						.returning()
						.get();
					createdTasks.push(result);
				}

				return createdTasks;
			}),
	});
};
