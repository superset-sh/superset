import { z } from "zod";

export const taskStatusEnumValues = [
	"backlog",
	"todo",
	"planning",
	"working",
	"needs-feedback",
	"ready-to-merge",
	"completed",
	"canceled",
] as const;
export const taskStatusEnum = z.enum(taskStatusEnumValues);
export type TaskStatus = z.infer<typeof taskStatusEnum>;

// Priority is standardized across systems (Linear uses 0-4 which maps to these)
export const taskPriorityValues = [
	"urgent",
	"high",
	"medium",
	"low",
	"none",
] as const;
export const taskPriorityEnum = z.enum(taskPriorityValues);
export type TaskPriority = z.infer<typeof taskPriorityEnum>;
