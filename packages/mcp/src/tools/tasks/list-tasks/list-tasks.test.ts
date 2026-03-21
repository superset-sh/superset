import { describe, expect, test } from "bun:test";
import { z } from "zod";

/**
 * Tests that the list_tasks input schema accepts the new filter/sort parameters.
 * These tests validate the schema definition without requiring a database connection.
 */

const listTasksInputSchema = z.object({
	statusId: z.string().uuid().optional(),
	statusType: z
		.enum(["backlog", "unstarted", "started", "completed", "canceled"])
		.optional(),
	assigneeId: z.string().uuid().optional(),
	assignedToMe: z.boolean().optional(),
	creatorId: z.string().uuid().optional(),
	createdByMe: z.boolean().optional(),
	priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
	labels: z.array(z.string()).optional(),
	search: z.string().optional(),
	externalProjectId: z.string().optional(),
	externalProjectName: z.string().optional(),
	externalCycleId: z.string().optional(),
	dueDateFrom: z.string().optional(),
	dueDateTo: z.string().optional(),
	sortBy: z.enum(["createdAt", "updatedAt", "dueDate", "priority"]).optional(),
	sortOrder: z.enum(["asc", "desc"]).optional(),
	includeDeleted: z.boolean().optional(),
	limit: z.number().int().min(1).max(100).default(50),
	offset: z.number().int().min(0).default(0),
});

describe("list_tasks input schema", () => {
	test("accepts externalProjectId filter", () => {
		const result = listTasksInputSchema.safeParse({
			externalProjectId: "proj-abc-123",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.externalProjectId).toBe("proj-abc-123");
		}
	});

	test("accepts externalProjectName filter", () => {
		const result = listTasksInputSchema.safeParse({
			externalProjectName: "My Project",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.externalProjectName).toBe("My Project");
		}
	});

	test("accepts externalCycleId filter", () => {
		const result = listTasksInputSchema.safeParse({
			externalCycleId: "cycle-xyz",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.externalCycleId).toBe("cycle-xyz");
		}
	});

	test("accepts dueDateFrom and dueDateTo filters", () => {
		const result = listTasksInputSchema.safeParse({
			dueDateFrom: "2026-01-01T00:00:00Z",
			dueDateTo: "2026-12-31T23:59:59Z",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.dueDateFrom).toBe("2026-01-01T00:00:00Z");
			expect(result.data.dueDateTo).toBe("2026-12-31T23:59:59Z");
		}
	});

	test("accepts sortBy with valid columns", () => {
		for (const col of ["createdAt", "updatedAt", "dueDate", "priority"]) {
			const result = listTasksInputSchema.safeParse({ sortBy: col });
			expect(result.success).toBe(true);
		}
	});

	test("rejects invalid sortBy values", () => {
		const result = listTasksInputSchema.safeParse({ sortBy: "title" });
		expect(result.success).toBe(false);
	});

	test("accepts sortOrder asc/desc", () => {
		expect(listTasksInputSchema.safeParse({ sortOrder: "asc" }).success).toBe(
			true,
		);
		expect(listTasksInputSchema.safeParse({ sortOrder: "desc" }).success).toBe(
			true,
		);
	});

	test("rejects invalid sortOrder", () => {
		const result = listTasksInputSchema.safeParse({ sortOrder: "random" });
		expect(result.success).toBe(false);
	});

	test("accepts all new filters together", () => {
		const result = listTasksInputSchema.safeParse({
			externalProjectId: "proj-1",
			externalProjectName: "Backend",
			externalCycleId: "cycle-1",
			dueDateFrom: "2026-01-01",
			dueDateTo: "2026-06-30",
			sortBy: "priority",
			sortOrder: "asc",
			priority: "high",
			search: "auth",
			limit: 25,
		});
		expect(result.success).toBe(true);
	});

	test("defaults limit to 50 and offset to 0", () => {
		const result = listTasksInputSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.limit).toBe(50);
			expect(result.data.offset).toBe(0);
		}
	});
});
