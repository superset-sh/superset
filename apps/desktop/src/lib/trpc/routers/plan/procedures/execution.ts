import { planTasks, plans, projects } from "@superset/local-db";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import {
	taskExecutionManager,
	type TaskExecutionOutput,
	type TaskExecutionProgress,
} from "main/lib/task-execution";
import { z } from "zod";
import { publicProcedure, router } from "../../..";

export const createExecutionProcedures = () => {
	return router({
		/**
		 * Start executing a task
		 */
		start: publicProcedure
			.input(z.object({ taskId: z.string() }))
			.mutation(({ input }) => {
				const task = localDb
					.select()
					.from(planTasks)
					.where(eq(planTasks.id, input.taskId))
					.get();

				if (!task) {
					throw new Error(`Task ${input.taskId} not found`);
				}

				// Get the plan to find the project ID
				const planRecord = localDb
					.select()
					.from(plans)
					.where(eq(plans.id, task.planId))
					.get();

				if (!planRecord) {
					throw new Error(`Plan ${task.planId} not found`);
				}

				// Get the project for the main repo path
				const projectRecord = localDb
					.select()
					.from(projects)
					.where(eq(projects.id, planRecord.projectId))
					.get();

				if (!projectRecord?.mainRepoPath) {
					throw new Error("Project main repo path not found");
				}

				// Update task status to queued
				localDb
					.update(planTasks)
					.set({
						status: "queued",
						executionStatus: "pending",
						updatedAt: Date.now(),
					})
					.where(eq(planTasks.id, input.taskId))
					.run();

				// Enqueue the task for execution
				taskExecutionManager.enqueue(
					task,
					planRecord.projectId,
					projectRecord.mainRepoPath,
				);

				return { success: true };
			}),

		/**
		 * Stop a running task
		 */
		stop: publicProcedure
			.input(z.object({ taskId: z.string() }))
			.mutation(({ input }) => {
				taskExecutionManager.cancel(input.taskId);

				// Update task status
				localDb
					.update(planTasks)
					.set({
						status: "backlog",
						executionStatus: null,
						updatedAt: Date.now(),
					})
					.where(eq(planTasks.id, input.taskId))
					.run();

				return { success: true };
			}),

		/**
		 * Pause a running task
		 */
		pause: publicProcedure
			.input(z.object({ taskId: z.string() }))
			.mutation(({ input }) => {
				taskExecutionManager.pause(input.taskId);
				return { success: true };
			}),

		/**
		 * Resume a paused task
		 */
		resume: publicProcedure
			.input(z.object({ taskId: z.string() }))
			.mutation(({ input }) => {
				taskExecutionManager.resume(input.taskId);
				return { success: true };
			}),

		/**
		 * Get current status of a task execution
		 */
		getStatus: publicProcedure
			.input(z.object({ taskId: z.string() }))
			.query(({ input }) => {
				return taskExecutionManager.getProgress(input.taskId) ?? null;
			}),

		/**
		 * Get all running tasks
		 */
		getAllRunning: publicProcedure.query(() => {
			return taskExecutionManager.getAllProgress();
		}),

		/**
		 * Get execution statistics
		 */
		getStats: publicProcedure.query(() => {
			return taskExecutionManager.getStats();
		}),

		/**
		 * Set max concurrent executions
		 */
		setMaxConcurrent: publicProcedure
			.input(z.object({ count: z.number().min(1).max(100) }))
			.mutation(({ input }) => {
				taskExecutionManager.setMaxConcurrent(input.count);
				return { success: true, maxConcurrent: input.count };
			}),

		/**
		 * Subscribe to task execution progress
		 */
		subscribeProgress: publicProcedure.subscription(() => {
			return observable<TaskExecutionProgress>((emit) => {
				const handler = (progress: TaskExecutionProgress) => {
					emit.next(progress);
				};

				taskExecutionManager.on("progress", handler);

				return () => {
					taskExecutionManager.off("progress", handler);
				};
			});
		}),

		/**
		 * Subscribe to task output for a specific task
		 */
		subscribeOutput: publicProcedure
			.input(z.object({ taskId: z.string() }))
			.subscription(({ input }) => {
				return observable<TaskExecutionOutput>((emit) => {
					const handler = (output: TaskExecutionOutput) => {
						emit.next(output);
					};

					taskExecutionManager.on(`output:${input.taskId}`, handler);

					return () => {
						taskExecutionManager.off(`output:${input.taskId}`, handler);
					};
				});
			}),

		/**
		 * Subscribe to all task output
		 */
		subscribeAllOutput: publicProcedure.subscription(() => {
			return observable<TaskExecutionOutput>((emit) => {
				const handler = (output: TaskExecutionOutput) => {
					emit.next(output);
				};

				taskExecutionManager.on("output", handler);

				return () => {
					taskExecutionManager.off("output", handler);
				};
			});
		}),
	});
};
